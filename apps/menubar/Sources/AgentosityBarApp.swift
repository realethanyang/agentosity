import SwiftUI
import AppKit

// MARK: - 数据模型(与 web API 对齐)

struct AgentsResponse: Codable {
    struct Live: Codable {
        let total: Int
        let by_company: [LiveAgent]
    }
    struct LiveAgent: Codable {
        let name: String
        let harness: String
        let since_minutes: Double
    }
    struct Row: Codable {
        let name: String
        let active_hours: Double
        let overtime_hours: Double
        let sessions: Int
        let leverage: Double?
        let live_now: Int
    }
    let board: [Row]
    let live: Live
}

struct MyAgents: Codable {
    let day: String
    let sessions: Int
    let active_hours: Double
    let session_hours: Double
    let live_now: Int
}

struct MyToday: Codable {
    let checked_in: Bool
    let clocked_local: String?
    let company: String?
}

struct Company: Codable {
    let id: String
    let name: String
}

struct CheckinResult: Codable {
    let ok: Bool?
    let clocked_local: String?
    let note: String?
    let error: String?
}

struct DeviceStart: Codable { let code: String? }
struct DevicePoll: Codable {
    let ok: Bool?
    let pending: Bool?
    let expired: Bool?
    let access_token: String?
    let email: String?
}

// MARK: - 配置(与 CLI 共用 ~/.agentosity/config.json)

func configURL() -> URL {
    FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".agentosity/config.json")
}

func loadRawConfig() -> [String: Any] {
    guard let data = try? Data(contentsOf: configURL()),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    return obj
}

/** 合并写回,不丢 CLI 写入的其他字段 */
func patchConfig(_ patch: [String: Any?]) {
    var cfg = loadRawConfig()
    for (k, v) in patch {
        if let v { cfg[k] = v } else { cfg.removeValue(forKey: k) }
    }
    if cfg["deviceId"] == nil { cfg["deviceId"] = UUID().uuidString.lowercased() }
    let dir = configURL().deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    if let data = try? JSONSerialization.data(withJSONObject: cfg, options: [.prettyPrinted]) {
        try? data.write(to: configURL())
    }
}

// MARK: - Store

@MainActor
final class Store: ObservableObject {
    @Published var liveTotal: Int?
    @Published var myCompanyRow: AgentsResponse.Row?
    @Published var myAgents: MyAgents?
    @Published var myToday: MyToday?
    @Published var errorText: String?
    @Published var loginWaiting = false
    @Published var config: [String: Any] = loadRawConfig()

    var company: String? { config["company"] as? String }
    var deviceId: String? { config["deviceId"] as? String }
    var email: String? { config["email"] as? String }
    var accessToken: String? { config["accessToken"] as? String }

    var apiBase: String {
        if let env = ProcessInfo.processInfo.environment["AGENTOSITY_API"] { return env }
        return (config["apiBase"] as? String) ?? "https://agentosity.com"
    }

    var installCommand: String {
        "npx agentosity init \"\(company ?? "你的公司名")\""
    }

    private func request(_ path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> Data {
        var req = URLRequest(url: URL(string: "\(apiBase)\(path)")!)
        req.httpMethod = method
        if let t = accessToken { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }

    private var identityQuery: String {
        accessToken != nil ? "" : "?device=\(deviceId ?? "")"
    }

    func refresh() async {
        config = loadRawConfig()
        do {
            let data = try await request("/api/agents")
            let resp = try JSONDecoder().decode(AgentsResponse.self, from: data)
            liveTotal = resp.live.total
            if let mine = company {
                myCompanyRow = resp.board.first { $0.name == mine }
            }
            errorText = nil
        } catch {
            errorText = "拿不到数据(网络?)"
        }
        if accessToken != nil || deviceId != nil {
            if let d = try? await request("/api/my-agents\(identityQuery)"),
               let mine = try? JSONDecoder().decode(MyAgents.self, from: d) {
                myAgents = mine
            }
            if let d = try? await request("/api/my-today\(identityQuery)"),
               let t = try? JSONDecoder().decode(MyToday.self, from: d) {
                myToday = t
            }
        }
    }

    func setCompany(_ name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        _ = try? await request("/api/companies", method: "POST", json: ["name": trimmed])
        patchConfig(["company": trimmed])
        config = loadRawConfig()
        await refresh()
    }

    func clockOut() async {
        guard let company else {
            errorText = "先设置你的公司"
            return
        }
        do {
            var comps = URLComponents(string: "\(apiBase)/api/companies")!
            comps.queryItems = [URLQueryItem(name: "q", value: company)]
            let (listData, _) = try await URLSession.shared.data(from: comps.url!)
            let list = try JSONDecoder().decode([Company].self, from: listData)
            guard let match = list.first(where: { $0.name == company }) ?? list.first else {
                errorText = "找不到公司「\(company)」"
                return
            }
            patchConfig([:]) // 确保 deviceId
            config = loadRawConfig()
            let data = try await request("/api/checkin", method: "POST", json: [
                "companyId": match.id, "deviceId": deviceId ?? "",
            ])
            let result = try JSONDecoder().decode(CheckinResult.self, from: data)
            if result.ok == true {
                errorText = nil
                await refresh()
            } else {
                errorText = result.error ?? "打卡失败"
            }
        } catch {
            errorText = "打卡失败(网络)"
        }
    }

    /** 浏览器登录(设备授权流) */
    func browserLogin() async {
        guard let d = try? await request("/api/device/start", method: "POST", json: [:]),
              let start = try? JSONDecoder().decode(DeviceStart.self, from: d),
              let code = start.code
        else {
            errorText = "无法发起登录(网络)"
            return
        }
        if let url = URL(string: "\(apiBase)/login?device=\(code)") {
            NSWorkspace.shared.open(url)
        }
        loginWaiting = true
        errorText = nil
        for _ in 0 ..< 150 { // 最长等 5 分钟
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard loginWaiting else { return } // 用户取消
            guard let pd = try? await request("/api/device/poll?code=\(code)"),
                  let poll = try? JSONDecoder().decode(DevicePoll.self, from: pd)
            else { continue }
            if poll.ok == true, let token = poll.access_token, let mail = poll.email {
                patchConfig(["email": mail, "accessToken": token])
                config = loadRawConfig()
                loginWaiting = false
                await refresh()
                return
            }
            if poll.expired == true {
                loginWaiting = false
                errorText = "登录超时,再试一次"
                return
            }
        }
        loginWaiting = false
    }

    func logout() {
        patchConfig(["email": nil, "accessToken": nil])
        config = loadRawConfig()
        myAgents = nil
        myToday = nil
    }
}

// MARK: - App

@main
struct AgentosityBarApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        MenuBarExtra {
            PopoverView(store: store)
        } label: {
            if let n = store.liveTotal, n > 0 {
                Text("🤖\(n)")
            } else {
                Text("🤖")
            }
        }
        .menuBarExtraStyle(.window)
    }
}

// MARK: - Popover UI

struct PopoverView: View {
    @ObservedObject var store: Store
    @Environment(\.openURL) private var openURL
    @State private var companyDraft = ""
    @State private var editingCompany = false
    @State private var copied = false
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Agentosity").font(.system(size: 18, weight: .black))
                Spacer()
                Text("AI-native is a number now.")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
            }

            // 公司设置
            if store.company == nil || editingCompany {
                HStack(spacing: 6) {
                    TextField("你的公司名", text: $companyDraft)
                        .textFieldStyle(.roundedBorder).font(.system(size: 12))
                    Button("保存") {
                        busy = true
                        Task {
                            await store.setCompany(companyDraft)
                            editingCompany = false
                            busy = false
                        }
                    }
                    .disabled(busy || companyDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                    .font(.system(size: 12, weight: .bold))
                }
            } else {
                HStack {
                    Text("🏢 \(store.company!)").font(.system(size: 12, weight: .heavy))
                    Button("改") {
                        companyDraft = store.company ?? ""
                        editingCompany = true
                    }
                    .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(.secondary)
                    Spacer()
                }
            }

            // 在岗实况
            HStack(spacing: 8) {
                Text("🤖").font(.system(size: 24))
                VStack(alignment: .leading, spacing: 1) {
                    Text("此刻 \(store.liveTotal.map(String.init) ?? "—") 个 Agent 在上班")
                        .font(.system(size: 13, weight: .heavy))
                    if let mine = store.myCompanyRow {
                        Text("\(mine.name):Active \(String(format: "%.1f", mine.active_hours))h · 在岗 \(mine.live_now)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.06)))

            // 我的 Agent 今日战报
            if let my = store.myAgents, my.sessions > 0 {
                HStack(spacing: 8) {
                    Text("⚡️").font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("你的 Agent 今天干了 \(String(format: "%.1f", my.active_hours)) 小时")
                            .font(.system(size: 12, weight: .heavy))
                        Text("会话 \(my.sessions) 个 · 在岗 \(my.session_hours, specifier: "%.1f")h · 此刻 \(my.live_now) 个在跑")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.yellow.opacity(0.25)))
            }

            // 人类打卡(状态与 Web 同步)
            if let today = store.myToday, today.checked_in {
                VStack(spacing: 6) {
                    Text("✅ 今天 \(today.clocked_local ?? "") 已打卡")
                        .font(.system(size: 14, weight: .black))
                    Button("改成现在下班 🔁") {
                        Task { await store.clockOut() }
                    }
                    .font(.system(size: 11, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            } else {
                Button {
                    Task { await store.clockOut() }
                } label: {
                    Text("我下班了 🎉")
                        .font(.system(size: 16, weight: .black))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 1.0, green: 0.42, blue: 0.62))
                .disabled(store.company == nil)
            }

            // Agent 考勤接入(可复制命令)
            VStack(alignment: .leading, spacing: 4) {
                Text("让你的 Agent 也被考勤(终端里跑一次):")
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    Text(store.installCommand)
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .lineLimit(1).truncationMode(.middle)
                        .padding(6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.85)))
                        .foregroundStyle(.white)
                    Button(copied ? "✅" : "📋 复制") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(store.installCommand, forType: .string)
                        copied = true
                        Task {
                            try? await Task.sleep(nanoseconds: 2_000_000_000)
                            copied = false
                        }
                    }
                    .font(.system(size: 10, weight: .bold))
                }
            }

            // 登录区(浏览器授权流)
            if let mail = store.email {
                HStack {
                    Text("✓ \(mail)").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    Spacer()
                    Button("退出登录") { store.logout() }
                        .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(.secondary)
                }
            } else if store.loginWaiting {
                HStack {
                    ProgressView().controlSize(.small)
                    Text("在浏览器里完成登录…").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    Spacer()
                    Button("取消") { store.loginWaiting = false }
                        .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(.secondary)
                }
            } else {
                Button("登录:多设备同步你的打卡和 Agent 记录 →") {
                    Task { await store.browserLogin() }
                }
                .font(.system(size: 10, weight: .bold)).buttonStyle(.plain)
                .foregroundStyle(.blue)
            }

            if let err = store.errorText {
                Text(err).font(.system(size: 10, weight: .bold)).foregroundStyle(.red)
            }

            Divider()

            HStack {
                Button("看榜") {
                    if let url = URL(string: "\(store.apiBase)/agents") { openURL(url) }
                }
                .font(.system(size: 11, weight: .bold))
                Spacer()
                Button("刷新") { Task { await store.refresh() } }
                    .font(.system(size: 11))
                Button("退出") { NSApplication.shared.terminate(nil) }
                    .font(.system(size: 11))
            }
        }
        .padding(14)
        .frame(width: 310)
        .task {
            await store.refresh()
        }
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in
            Task { await store.refresh() }
        }
    }
}
