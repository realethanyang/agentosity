import Foundation

/**
 * 进程雷达(第二传感器):补录那些没有 MCP 考勤的本机 harness 会话。
 * 进程出现 = start,消失 = end;活跃度 = 会话文件 mtime + 子进程信号。
 * 去重:进程的子进程里已有 agentosity serve(MCP 考勤)则跳过。
 * 上报走与 MCP 完全相同的 API 契约,probe 标记为 "radar"。
 */
@MainActor
final class RadarEngine {
    struct Tracked {
        var sessionId: String?
        var harness: String
        var cwd: String?
        var activeSeconds: Int = 0
        var lastTickActive = false
        // 活跃判定的记忆:子进程基线(会话自带的常驻子进程,如 MCP server)与 CPU 累计值
        var baselineChildren: Set<Int32> = []
        var baselineTaken = false
        var lastCpuSeconds: Double = -1
    }

    private(set) var tracked: [Int32: Tracked] = [:]
    var adoptedCount: Int { tracked.count }

    private let harnessBinaries: [(bin: String, harness: String)] = [
        ("claude", "claude-code"),
        ("codex", "codex"),
        ("opencode", "opencode"),
        ("gemini", "gemini-cli"),
    ]

    // 由 Store 注入的上下文
    var apiBase: () -> String = { "https://agentosity.com" }
    var company: () -> String? = { nil }
    var deviceId: () -> String? = { nil }
    var accessToken: () -> String? = { nil }

    private let tickSeconds = 30

    // MARK: - 主循环

    func tick() async {
        guard company() != nil else { return } // 没绑公司不补录

        var found: [Int32: String] = [:] // pid → harness
        for h in harnessBinaries {
            for pid in pgrep(exact: h.bin) {
                found[pid] = h.harness
            }
        }

        // 消失的进程 → 下班
        for (pid, t) in tracked where found[pid] == nil {
            if let sid = t.sessionId {
                await post("/api/agent/end", ["session_id": sid, "active_seconds": t.activeSeconds])
            }
            tracked.removeValue(forKey: pid)
        }

        // 新进程 → 入册(有 MCP 考勤的跳过)
        for (pid, harness) in found where tracked[pid] == nil {
            if hasMCPAttendance(pid: pid) { continue }
            var t = Tracked(sessionId: nil, harness: harness, cwd: cwdOf(pid: pid))
            if let comp = company() {
                let resp = await post("/api/agent/start", [
                    "company": comp,
                    "harness": harness,
                    "probe": "radar",
                    "deviceId": deviceId() ?? "",
                ])
                t.sessionId = resp?["session_id"] as? String
            }
            tracked[pid] = t
        }

        // 同一会话目录被多个会话共享时,写盘信号分不清是谁写的 → 只对独占目录启用
        var artifactCount: [String: Int] = [:]
        for (_, t) in tracked {
            if let a = sessionArtifact(harness: t.harness, cwd: t.cwd) {
                artifactCount[a, default: 0] += 1
            }
        }

        // 心跳 + 活跃度
        for (pid, var t) in tracked {
            guard let sid = t.sessionId else { continue }
            let active = isActive(pid: pid, t: &t, artifactCount: artifactCount)
            if active { t.activeSeconds += tickSeconds }
            t.lastTickActive = active
            tracked[pid] = t
            await post("/api/agent/heartbeat", [
                "session_id": sid,
                "active_seconds": t.activeSeconds,
                "probe": "radar",
                "active": active,
            ])
        }
    }

    /** App 退出/雷达关闭时尽量收尾(收不完也有服务端心跳超时兜底) */
    func shutdown() async {
        for (_, t) in tracked {
            if let sid = t.sessionId {
                await post("/api/agent/end", ["session_id": sid, "active_seconds": t.activeSeconds])
            }
        }
        tracked.removeAll()
    }

    // MARK: - 活跃度信号

    private func isActive(pid: Int32, t: inout Tracked, artifactCount: [String: Int]) -> Bool {
        var active = false

        // 信号 1:进程 CPU 累计值有实质增长(推理流式解析/渲染会烧 CPU,干等不会)
        let cpu = cpuSecondsOf(pid: pid)
        if t.lastCpuSeconds >= 0, cpu - t.lastCpuSeconds > 1.0 {
            active = true
        }
        t.lastCpuSeconds = cpu

        // 信号 2:出现了"基线之外"的新子进程(= 工具调用在跑)。
        // 基线 = 首次观测时的常驻子进程(MCP server 等),它们一直在,不代表在干活。
        let children = Set(pgrepChildren(of: pid))
        if !t.baselineTaken {
            t.baselineChildren = children
            t.baselineTaken = true
        } else {
            t.baselineChildren.formIntersection(children) // 死掉的移出基线
            if !children.subtracting(t.baselineChildren).isEmpty {
                active = true
            }
        }

        // 信号 3:会话文件最近 90 秒有写入 —— 仅当该目录只有这一个会话在用(否则分不清是谁写的)
        if !active, let dir = sessionArtifact(harness: t.harness, cwd: t.cwd), artifactCount[dir] == 1 {
            if let mtime = newestMtime(at: dir), Date().timeIntervalSince(mtime) < 90 {
                active = true
            }
        }
        return active
    }

    /** 进程累计 CPU 秒("mm:ss.cc" / "hh:mm:ss" 格式) */
    private func cpuSecondsOf(pid: Int32) -> Double {
        let raw = run("/bin/ps", ["-o", "time=", "-p", String(pid)])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = raw.split(separator: ":").compactMap { Double($0) }
        guard !parts.isEmpty else { return 0 }
        return parts.reversed().enumerated().reduce(0) { acc, e in
            acc + e.element * pow(60, Double(e.offset))
        }
    }

    /** 各 harness 的会话痕迹位置(文件或目录) */
    private func sessionArtifact(harness: String, cwd: String?) -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        switch harness {
        case "claude-code":
            guard let cwd else { return nil }
            let slug = cwd.replacingOccurrences(of: "[/.\\s_]", with: "-", options: .regularExpression)
            return "\(home)/.claude/projects/\(slug)"
        case "codex":
            let f = DateFormatter()
            f.dateFormat = "yyyy/MM/dd"
            return "\(home)/.codex/sessions/\(f.string(from: Date()))"
        case "opencode":
            return "\(home)/.local/share/opencode/opencode.db-wal"
        default:
            return nil
        }
    }

    /** 文件或目录下最新的 mtime */
    private func newestMtime(at path: String) -> Date? {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: path, isDirectory: &isDir) else { return nil }
        if !isDir.boolValue {
            return (try? fm.attributesOfItem(atPath: path))?[.modificationDate] as? Date
        }
        guard let names = try? fm.contentsOfDirectory(atPath: path) else { return nil }
        var newest: Date?
        for n in names {
            if let d = (try? fm.attributesOfItem(atPath: "\(path)/\(n)"))?[.modificationDate] as? Date {
                if newest == nil || d > newest! { newest = d }
            }
        }
        return newest
    }

    // MARK: - 进程工具

    private func hasMCPAttendance(pid: Int32) -> Bool {
        // 递归查一层:MCP server 是 harness 的直接子进程(node .../agentosity serve)
        for c in pgrepChildren(of: pid) where commandOf(pid: c).contains("agentosity") {
            return true
        }
        return false
    }

    private func pgrep(exact name: String) -> [Int32] {
        run("/usr/bin/pgrep", ["-x", name])
            .split(separator: "\n").compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }
    }

    private func pgrepChildren(of pid: Int32) -> [Int32] {
        run("/usr/bin/pgrep", ["-P", String(pid)])
            .split(separator: "\n").compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }
    }

    private func commandOf(pid: Int32) -> String {
        run("/bin/ps", ["-o", "command=", "-p", String(pid)])
    }

    private func cwdOf(pid: Int32) -> String? {
        let out = run("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
        for line in out.split(separator: "\n") where line.hasPrefix("n") {
            return String(line.dropFirst())
        }
        return nil
    }

    private func run(_ path: String, _ args: [String]) -> String {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = args
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = Pipe()
        do {
            try p.run()
        } catch {
            return ""
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return String(data: data, encoding: .utf8) ?? ""
    }

    // MARK: - 上报

    @discardableResult
    private func post(_ path: String, _ json: [String: Any]) async -> [String: Any]? {
        guard let url = URL(string: "\(apiBase())\(path)") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = accessToken() { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try? JSONSerialization.data(withJSONObject: json)
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
