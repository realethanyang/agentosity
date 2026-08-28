import SwiftUI

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

struct AuthSendResult: Codable { let ok: Bool?; let error: String? }
struct AuthVerifyResult: Codable {
    let ok: Bool?
    let email: String?
    let access_token: String?
    let error: String?
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
func patchConfig(_ patch: [String: Any]) {
    var cfg = loadRawConfig()
    for (k, v) in patch { cfg[k] = v }
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
    @Published var liveAgents: [AgentsResponse.LiveAgent] = []
    @Published var myAgents: MyAgents?
    @Published var clockedOut: String?
    @Published var errorText: String?
    @Published var config: [String: Any] = loadRawConfig()

    var company: String? { config["company"] as? String }
    var deviceId: String? { config["deviceId"] as? String }
    var email: String? { config["email"] as? String }
    var accessToken: String? { config["accessToken"] as? String }

    var apiBase: String {
        if let env = ProcessInfo.processInfo.environment["AGENTOSITY_API"] { return env }
        return (config["apiBase"] as? String) ?? "https://agentosity.com"
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

    func refresh() async {
        config = loadRawConfig()
        do {
            let data = try await request("/api/agents")
            let resp = try JSONDecoder().decode(AgentsResponse.self, from: data)
            liveTotal = resp.live.total
            liveAgents = resp.live.by_company
            if let mine = company {
                myCompanyRow = resp.board.first { $0.name == mine }
            }
            errorText = nil
        } catch {
            errorText = "拿不到数据(网络?)"
        }
        // 个人战报:登录态或设备 ID 任一即可
        if accessToken != nil || deviceId != nil {
            let q = accessToken != nil ? "" : "?device=\(deviceId ?? "")"
            if let data = try? await request("/api/my-agents\(q)"),
               let mine = try? JSONDecoder().decode(MyAgents.self, from: data) {
                myAgents = mine
            }
        }
    }

    func clockOut() async {
        guard let company else {
            errorText = "先在终端跑:npx agentosity init <公司名>"
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
            let data = try await request("/api/checkin", method: "POST", json: [
                "companyId": match.id, "deviceId": deviceId ?? "",
            ])
            let result = try JSONDecoder().decode(CheckinResult.self, from: data)
            if result.ok == true {
                clockedOut = result.clocked_local
                errorText = nil
            } else {
                errorText = result.error ?? "打卡失败"
            }
        } catch {
            errorText = "打卡失败(网络)"
        }
    }

    func sendCode(email: String) async -> Bool {
        guard let data = try? await request("/api/auth/send", method: "POST", json: ["email": email]),
              let r = try? JSONDecoder().decode(AuthSendResult.self, from: data)
        else {
            errorText = "发送失败(网络)"
            return false
        }
        if r.ok == true { errorText = nil; return true }
        errorText = r.error ?? "发送失败"
        return false
    }

    func verify(email: String, code: String) async -> Bool {
        patchConfig([:]) // 确保 deviceId 存在,登录时并入历史
        config = loadRawConfig()
        guard let data = try? await request("/api/auth/verify", method: "POST", json: [
            "email": email, "code": code, "deviceId": deviceId ?? "",
        ]),
            let r = try? JSONDecoder().decode(AuthVerifyResult.self, from: data)
        else {
            errorText = "验证失败(网络)"
            return false
        }
        if r.ok == true, let token = r.access_token, let mail = r.email {
            patchConfig(["email": mail, "accessToken": token])
            config = loadRawConfig()
            errorText = nil
            await refresh()
            return true
        }
        errorText = r.error ?? "验证码不对或已过期"
        return false
    }

    func logout() {
        patchConfig(["email": NSNull(), "accessToken": NSNull()])
        // NSNull 序列化后为 null,重新读时按缺失处理不可靠 → 直接删键
        var cfg = loadRawConfig()
        cfg.removeValue(forKey: "email")
        cfg.removeValue(forKey: "accessToken")
        if let data = try? JSONSerialization.data(withJSONObject: cfg, options: [.prettyPrinted]) {
            try? data.write(to: configURL())
        }
        config = loadRawConfig()
        myAgents = nil
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
    @State private var loginEmail = ""
    @State private var loginCode = ""
    @State private var loginStage = 0 // 0 收起 1 输邮箱 2 输码
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

            // 在岗实况(全网 + 本公司)
            HStack(spacing: 8) {
                Text("🤖").font(.system(size: 24))
                VStack(alignment: .leading, spacing: 1) {
                    Text("此刻 \(store.liveTotal.map(String.init) ?? "—") 个 Agent 在上班")
                        .font(.system(size: 13, weight: .heavy))
                    if let mine = store.myCompanyRow {
                        Text("\(mine.name):Active \(String(format: "%.1f", mine.active_hours))h · 在岗 \(mine.live_now)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.secondary)
                    } else if let company = store.company {
                        Text("\(company):近 7 天暂无 Agent 工时")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                    } else {
                        Text("终端跑 npx agentosity init <公司名> 接入")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
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

            // 人类打卡
            if let t = store.clockedOut {
                VStack(spacing: 4) {
                    Text("✅ 下班快乐!").font(.system(size: 15, weight: .black))
                    Text(t).font(.system(size: 11)).foregroundStyle(.secondary)
                    Text("明早 10:00 揭榜").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
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
            }

            // 登录区
            if let mail = store.email {
                HStack {
                    Text("✓ \(mail)").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    Spacer()
                    Button("退出登录") { store.logout() }
                        .font(.system(size: 10)).buttonStyle(.plain).foregroundStyle(.secondary)
                }
            } else if loginStage == 0 {
                Button("登录:多设备同步你的打卡和 Agent 记录 →") { loginStage = 1 }
                    .font(.system(size: 10, weight: .bold)).buttonStyle(.plain)
                    .foregroundStyle(.blue)
            } else {
                VStack(spacing: 6) {
                    if loginStage == 1 {
                        TextField("邮箱", text: $loginEmail)
                            .textFieldStyle(.roundedBorder).font(.system(size: 12))
                        Button(busy ? "发送中…" : "发验证码") {
                            busy = true
                            Task {
                                if await store.sendCode(email: loginEmail) { loginStage = 2 }
                                busy = false
                            }
                        }
                        .disabled(busy || !loginEmail.contains("@"))
                        .font(.system(size: 12, weight: .bold))
                    } else {
                        TextField("6 位验证码", text: $loginCode)
                            .textFieldStyle(.roundedBorder).font(.system(size: 14, weight: .black))
                        Button(busy ? "验证中…" : "登录") {
                            busy = true
                            Task {
                                if await store.verify(email: loginEmail, code: loginCode) { loginStage = 0 }
                                busy = false
                            }
                        }
                        .disabled(busy || loginCode.count < 6)
                        .font(.system(size: 12, weight: .bold))
                    }
                }
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
        .frame(width: 300)
        .task {
            await store.refresh()
        }
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in
            Task { await store.refresh() }
        }
    }
}
