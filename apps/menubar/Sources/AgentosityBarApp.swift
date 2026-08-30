import SwiftUI
import AppKit

// MARK: - 数据模型(与 web API 对齐)

struct AgentsResponse: Codable {
    struct Live: Codable {
        let total: Int
        let working: Int?
        let idle: Int?
        let today_active_hours: Double?
        let by_company: [LiveAgent]
    }
    struct LiveAgent: Codable {
        let name: String
        let harness: String
        let working: Bool?
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

struct Pulse: Codable {
    let checked_out: Int
    let still_working: Int
    let companies_all_out: Int
    let companies_total: Int
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

struct Profile: Codable {
    let company: Company?
    let can_change: Bool?
    let next_change_at: String?
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
    let refresh_token: String?
    let email: String?
}

struct RefreshResult: Codable {
    let ok: Bool?
    let access_token: String?
    let refresh_token: String?
    let email: String?
}

/** JWT exp(毫秒);解析失败按已过期处理 */
func jwtExpMs(_ token: String) -> Double {
    let parts = token.split(separator: ".")
    guard parts.count >= 2 else { return 0 }
    var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while b64.count % 4 != 0 { b64 += "=" }
    guard let data = Data(base64Encoded: b64),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let exp = obj["exp"] as? Double
    else { return 0 }
    return exp * 1000
}

let APP_VERSION = "0.3.5"

// MARK: - 品牌色

enum Brand {
    static let ink = Color(red: 0.07, green: 0.07, blue: 0.07)
    static let yellow = Color(red: 1.0, green: 0.85, blue: 0.24)
    static let pink = Color(red: 1.0, green: 0.42, blue: 0.62)
    static let green = Color(red: 0.42, green: 0.80, blue: 0.47)
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
    @Published var live: AgentsResponse.Live?
    @Published var myCompanyRow: AgentsResponse.Row?
    @Published var pulse: Pulse?
    @Published var myAgents: MyAgents?
    @Published var myToday: MyToday?
    @Published var errorText: String?
    @Published var loginWaiting = false
    @Published var radarCount = 0
    @Published var installResult: String?
    @Published var installing = false
    @Published var updateURL: String?
    @Published var config: [String: Any] = loadRawConfig()

    /** 每次启动查一次 GitHub 最新版(App 是手动分发,给个升级提示) */
    func checkUpdate() async {
        guard let url = URL(string: "https://api.github.com/repos/realethanyang/agentosity/releases/latest"),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tag = obj["tag_name"] as? String
        else { return }
        if tag != "v\(APP_VERSION)" {
            updateURL = "https://github.com/realethanyang/agentosity/releases/latest/download/Agentosity.app.zip"
        }
    }

    let radar = RadarEngine()
    private var backgroundStarted = false

    var radarEnabled: Bool { (config["radar"] as? Bool) ?? true }

    /** 常驻循环:雷达补录 + 菜单栏数字刷新(弹窗关着也在跑) */
    func startBackground() {
        guard !backgroundStarted else { return }
        backgroundStarted = true
        radar.apiBase = { [weak self] in self?.apiBase ?? "https://agentosity.com" }
        radar.company = { [weak self] in self?.company }
        radar.deviceId = { [weak self] in self?.deviceId }
        radar.accessToken = { [weak self] in self?.accessToken }
        NotificationCenter.default.addObserver(forName: Notification.Name("agentosity.login"), object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.browserLogin() }
        }
        Task { [weak self] in
            await self?.checkUpdate()
            // 直接下载 App 的用户没有 CLI 写好的凭证:首启主动请登录,别蹲在看不见的菜单栏里干等
            if let self, self.accessToken == nil { await self.promptLoginOnce() }
            while true {
                guard let self else { return }
                await self.refresh()
                // 统一登录:雷达只在登录后工作
                if self.radarEnabled && self.accessToken != nil {
                    await self.radar.tick()
                    self.radarCount = self.radar.adoptedCount
                } else if self.radarCount > 0 {
                    await self.radar.shutdown()
                    self.radarCount = 0
                }
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    func setRadar(enabled: Bool) {
        patchConfig(["radar": enabled])
        config = loadRawConfig()
    }

    @Published var profileCompany: String?
    /** 展示与归属用:服务端绑定优先,本地配置兜底(CLI/雷达共用的缓存) */
    var company: String? { profileCompany ?? (config["company"] as? String) }
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

    /** access token 快过期就用 refresh token 换新(轮换制,新旧一起存) */
    func ensureFreshToken() async {
        guard let t = accessToken else { return }
        if jwtExpMs(t) - Date().timeIntervalSince1970 * 1000 > 5 * 60 * 1000 { return }
        guard let rt = config["refreshToken"] as? String else {
            patchConfig(["email": nil, "accessToken": nil])
            config = loadRawConfig()
            return
        }
        // 注意:不能在续期期间清掉共享配置里的 accessToken——CLI 的考勤进程共用这份文件,
        // 清了它们就变成匿名请求,会话会被记到裸设备身份上(成员数虚增 bug 的元凶之一)
        guard let d = try? await request("/api/auth/refresh", method: "POST", json: ["refresh_token": rt]),
              let r = try? JSONDecoder().decode(RefreshResult.self, from: d), r.ok == true,
              let at = r.access_token
        else {
            // 续期失败:退回未登录态
            // 轮换撞车保护:兄弟进程(CLI serve)可能已刷新成功,磁盘上是新凭证时不清
            let onDisk = loadRawConfig()["refreshToken"] as? String
            if onDisk == rt {
                patchConfig(["email": nil, "accessToken": nil, "refreshToken": nil])
            }
            config = loadRawConfig()
            return
        }
        patchConfig(["accessToken": at, "refreshToken": r.refresh_token ?? rt])
        config = loadRawConfig()
    }

    func refresh() async {
        config = loadRawConfig()
        await ensureFreshToken()
        do {
            let data = try await request("/api/agents?days=1")
            let resp = try JSONDecoder().decode(AgentsResponse.self, from: data)
            live = resp.live
            if let mine = company {
                myCompanyRow = resp.board.first { $0.name == mine }
            }
            errorText = nil
        } catch {
            errorText = "拿不到数据(网络?)"
        }
        if let d = try? await request("/api/pulse"),
           let p = try? JSONDecoder().decode(Pulse.self, from: d) {
            pulse = p
        }
        if accessToken != nil || deviceId != nil {
            if let d = try? await request("/api/profile\(identityQuery)"),
               let p = try? JSONDecoder().decode(Profile.self, from: d) {
                profileCompany = p.company?.name
                // 写回本地缓存,CLI 的 MCP 考勤和进程雷达共用这个归属
                if let name = p.company?.name, (config["company"] as? String) != name {
                    patchConfig(["company": name])
                    config = loadRawConfig()
                }
            }
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

    func clockOut() async {
        do {
            patchConfig([:]) // 确保 deviceId
            config = loadRawConfig()
            let data = try await request("/api/checkin", method: "POST", json: [
                "deviceId": deviceId ?? "",
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
    private var didPromptLogin = false
    func promptLoginOnce() async {
        guard !didPromptLogin else { return }
        didPromptLogin = true
        let a = NSAlert()
        a.messageText = "欢迎!登录后开始 Agent 考勤"
        a.informativeText = "点「登录」用浏览器完成授权——你在网页上登录过的话,基本一路自动。登录后我就住在右上角菜单栏(⚡/🤖 图标)里,自动统计你的 Agent 工时。"
        a.addButton(withTitle: "登录")
        a.addButton(withTitle: "稍后")
        NSApp.activate(ignoringOtherApps: true)
        if a.runModal() == .alertFirstButtonReturn { await browserLogin() }
    }

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
        for _ in 0 ..< 150 {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard loginWaiting else { return }
            guard let pd = try? await request("/api/device/poll?code=\(code)"),
                  let poll = try? JSONDecoder().decode(DevicePoll.self, from: pd)
            else { continue }
            if poll.ok == true, let token = poll.access_token, let mail = poll.email {
                patchConfig(["email": mail, "accessToken": token, "refreshToken": poll.refresh_token])
                config = loadRawConfig()
                loginWaiting = false
                // 把这台设备的匿名历史并入账号
                if let dev = deviceId {
                    _ = try? await request("/api/auth/merge", method: "POST", json: ["deviceId": dev])
                }
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
        patchConfig(["email": nil, "accessToken": nil, "refreshToken": nil])
        config = loadRawConfig()
        myAgents = nil
        myToday = nil
    }

    /** 一键接入:复用 CLI 的 init(单一事实源,覆盖全部已适配 harness)。App 已登录,CLI 共用同一配置。 */
    func autoInstallMCP() async {
        guard let comp = company else {
            errorText = "先在网页绑定公司"
            return
        }
        installing = true
        defer { installing = false }
        let out = await Task.detached {
            Self.loginShell("npx -y agentosity init \"\(comp)\" 2>&1")
        }.value
        if out.contains("✅") {
            let hits = out.split(separator: "\n").filter { $0.contains("✅") && !$0.contains("公司") }
            installResult = "已接入 \(hits.count) 个 harness · 新开的会话生效"
        } else if out.isEmpty {
            installResult = "接入失败:未找到 npx(需要 Node.js)"
        } else {
            installResult = String(out.split(separator: "\n").last ?? "接入失败")
        }
        await refresh()
    }

    nonisolated static func loginShell(_ cmd: String) -> String {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", cmd]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        do { try p.run() } catch { return "" }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}

// MARK: - App

/** 从下载目录直接运行时,提示一键移入「应用程序」(mac 用户的肌肉记忆) */
@MainActor
func offerMoveToApplications() {
    let path = Bundle.main.bundlePath
    guard !path.hasPrefix("/Applications") else { return }
    let alert = NSAlert()
    alert.messageText = "把 Agentosity 移到「应用程序」?"
    alert.informativeText = "App 目前在 \(URL(fileURLWithPath: path).deletingLastPathComponent().lastPathComponent) 文件夹运行。移到「应用程序」后更好找,也不会被误删。"
    alert.addButton(withTitle: "移动并重新打开")
    alert.addButton(withTitle: "暂不")
    guard alert.runModal() == .alertFirstButtonReturn else { return }
    let dest = "/Applications/Agentosity.app"
    let fm = FileManager.default
    try? fm.removeItem(atPath: dest)
    do {
        try fm.copyItem(atPath: path, toPath: dest)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        p.arguments = [dest]
        try? p.run()
        try? fm.removeItem(atPath: path) // 尽力清理原位置
        NSApplication.shared.terminate(nil)
    } catch {
        let e = NSAlert()
        e.messageText = "移动失败"
        e.informativeText = "你可以手动把 Agentosity 拖进「应用程序」文件夹。"
        e.runModal()
    }
}

/// 双击"应用程序"里一个已在运行的菜单栏 App,系统默认零反馈 —— 弹个提示指路,别让人以为打不开
final class ReopenDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        let email = loadRawConfig()["email"] as? String
        let a = NSAlert()
        NSApp.activate(ignoringOtherApps: true)
        if let email {
            a.messageText = "Agentosity 正在运行(已登录 \(email))"
            a.informativeText = "它住在右上角菜单栏(⚡/🤖 图标),没有窗口是正常的。找不到图标?多半是菜单栏太挤或被刘海遮住——去掉几个别的图标就能看到;考勤不受影响,网页端照常统计。"
            a.addButton(withTitle: "打开网页面板")
            a.addButton(withTitle: "知道了")
            if a.runModal() == .alertFirstButtonReturn,
               let url = URL(string: "https://agentosity.com/me") { NSWorkspace.shared.open(url) }
        } else {
            a.messageText = "Agentosity 正在运行,但还没登录"
            a.informativeText = "点「登录」用浏览器完成授权——你在网页上登录过的话,基本一路自动。之后它就在右上角菜单栏里自动统计你的 Agent 工时。"
            a.addButton(withTitle: "登录")
            a.addButton(withTitle: "稍后")
            if a.runModal() == .alertFirstButtonReturn {
                NotificationCenter.default.post(name: Notification.Name("agentosity.login"), object: nil)
            }
        }
        return false
    }
}

@main
struct AgentosityBarApp: App {
    @StateObject private var store = Store()
    @NSApplicationDelegateAdaptor(ReopenDelegate.self) private var reopenDelegate

    init() {
        Task { @MainActor in offerMoveToApplications() }
    }

    var body: some Scene {
        MenuBarExtra {
            PopoverView(store: store)
        } label: {
            Group {
                // 登录后显示"自己的在跑 Agent 数",未登录显示全网在岗
                if store.email != nil, let mine = store.myAgents, mine.live_now > 0 {
                    Text("⚡\(mine.live_now)")
                } else if let l = store.live, l.total > 0 {
                    Text("🤖\(l.total)")
                } else {
                    Text("🤖")
                }
            }
            .task { store.startBackground() }
        }
        .menuBarExtraStyle(.window)
    }
}

// MARK: - 复用小组件

struct Card<Content: View>: View {
    var bg: Color = Color(nsColor: .textBackgroundColor)
    var stroke: Color = .black.opacity(0.85)
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(bg)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(stroke, lineWidth: 2)
            )
            .background(
                // 硬阴影:Neo Brutalism 的小致敬
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.black.opacity(0.9))
                    .offset(x: 3, y: 3)
            )
    }
}

// MARK: - Popover UI

struct PopoverView: View {
    @ObservedObject var store: Store
    @Environment(\.openURL) private var openURL
    @State private var copied = false
    @State private var showInstall = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if store.email != nil {
                // 内环:我的 Agent + 个人对照
                if let my = store.myAgents, my.sessions > 0 {
                    myAgentsCard(my)
                }
                checkinSection
            }
            // 外环:全网
            agentHeroCard
            if let p = store.pulse, p.checked_out > 0 || p.still_working > 0 {
                pulseCard(p)
            }
            if store.email == nil {
                // 统一登录:未登录 = 只读橱窗 + 登录入口
                Button {
                    Task { await store.browserLogin() }
                } label: {
                    Text(store.loginWaiting ? "在浏览器里完成登录…" : "登录后开始使用 →")
                        .font(.system(size: 15, weight: .black))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                }
                .buttonStyle(.borderedProminent)
                .tint(Brand.pink)
                .disabled(store.loginWaiting)
                Text("打卡 · Agent 考勤 · 个人战报,登录后解锁(免密码,邮箱验证码)")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            } else {
                installSection
            }
            if let err = store.errorText {
                Text(err).font(.system(size: 10, weight: .bold)).foregroundStyle(.red)
            }
            footer
        }
        .padding(14)
        .frame(width: 320)
        .task { await store.refresh() }
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in
            Task { await store.refresh() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(alignment: .firstTextBaseline) {
                Text("下班榜").font(.system(size: 17, weight: .black))
                Text("Agentosity").font(.system(size: 12, weight: .heavy)).foregroundStyle(.secondary)
                Spacer()
                if let mail = store.email {
                    Menu {
                        Text(mail)
                        Button("退出登录") { store.logout() }
                    } label: {
                        Text("✓ 已登录").font(.system(size: 10, weight: .bold))
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                } else if store.loginWaiting {
                    HStack(spacing: 4) {
                        ProgressView().controlSize(.mini)
                        Button("取消") { store.loginWaiting = false }
                            .font(.system(size: 9)).buttonStyle(.plain).foregroundStyle(.secondary)
                    }
                } else {
                    Button("登录") { Task { await store.browserLogin() } }
                        .font(.system(size: 10, weight: .bold))
                        .buttonStyle(.plain)
                        .foregroundStyle(.blue)
                        .help("在浏览器中登录,多设备同步打卡和 Agent 记录")
                }
            }
            Text("AI-native is a number now.")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.secondary)
        }
    }

    private var agentHeroCard: some View {
        Card(bg: Brand.ink, stroke: .clear) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("⚡ \(store.live?.working ?? 0)/\(store.live?.total ?? 0)")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.white)
                    Text("全网在岗 Agent 正在干活")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer()
                }
                if let l = store.live {
                    Text("今日全网已产出 \(String(format: "%.1f", l.today_active_hours ?? 0)) agent-hours · 😴 \(l.idle ?? 0) 个挂机")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.6))
                }
                if let mine = store.myCompanyRow {
                    Text("\(mine.name) · 今日 \(String(format: "%.1f", mine.active_hours))h · 在岗 \(mine.live_now)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
    }

    private func pulseCard(_ p: Pulse) -> some View {
        Card(bg: Brand.green.opacity(0.22)) {
            VStack(alignment: .leading, spacing: 2) {
                Text("🏃 全网 \(p.checked_out)/\(p.checked_out + p.still_working) 位用户已下班")
                    .font(.system(size: 13, weight: .heavy))
                HStack(spacing: 8) {
                    if p.still_working > 0 {
                        Text("\(p.still_working) 人还在岗")
                    }
                    if p.companies_all_out > 0 {
                        Text("🏢 \(p.companies_all_out) 家公司全员撤离")
                    }
                }
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            }
        }
    }

    private func myAgentsCard(_ my: MyAgents) -> some View {
        Card(bg: Brand.yellow.opacity(0.35)) {
            VStack(alignment: .leading, spacing: 2) {
                Text("⚡️ 你的 Agent 今天干了 \(String(format: "%.1f", my.active_hours)) 小时")
                    .font(.system(size: 13, weight: .heavy))
                Text(my.live_now > 0 ? "此刻 \(my.live_now) 个还在跑 · 考勤全自动" : "考勤全自动,开工自动记")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var checkinSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let today = store.myToday, today.checked_in {
                // 个人对照行:灵魂在个人尺度的复刻
                HStack {
                    Text("✅ 你 \(today.clocked_local ?? "") 已下班\(store.myAgents.map { $0.live_now > 0 ? " · Agent 还有 \($0.live_now) 个在岗" : "" } ?? "")")
                        .font(.system(size: 12, weight: .black))
                        .lineLimit(2)
                    Spacer()
                    Button("🔁") { Task { await store.clockOut() } }
                        .font(.system(size: 10, weight: .bold))
                        .help("把下班时间改成现在")
                }
                .padding(.vertical, 2)
            } else {
                Text("🤖 Agent 考勤全自动 —— 这颗按钮是给你的,下班那刻按")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
                Button {
                    if store.company == nil {
                        openCheckinPage() // 没绑公司 → 去网页绑定
                    } else {
                        Task { await store.clockOut() }
                    }
                } label: {
                    Text(store.company == nil ? "去网页选择公司 →" : "我下班了 🎉")
                        .font(.system(size: 15, weight: .black))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                }
                .buttonStyle(.borderedProminent)
                .tint(Brand.pink)
            }

            // 公司仅展示;改绑去网页(每周一次的限频在服务端)
            HStack(spacing: 4) {
                if let c = store.company {
                    Text("🏢 \(c)").font(.system(size: 10, weight: .bold)).foregroundStyle(.secondary)
                    Button("改绑 ↗") { openCheckinPage() }
                        .font(.system(size: 9)).buttonStyle(.plain).foregroundStyle(.secondary)
                        .help("在网页上改绑公司(每周最多一次)")
                }
                Spacer()
            }
        }
    }

    private func openCheckinPage() {
        if let url = URL(string: "\(store.apiBase)/checkin") { openURL(url) }
    }

    private var installSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { showInstall.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Text(showInstall ? "▾" : "▸").font(.system(size: 9, weight: .black))
                    Text("让你的 Agent 也被考勤").font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)

            if showInstall {
                HStack(spacing: 6) {
                    Button(store.installing ? "接入中…" : "🔌 一键接入 Agent 考勤") {
                        Task { await store.autoInstallMCP() }
                    }
                    .disabled(store.installing)
                    .font(.system(size: 11, weight: .bold))
                    Spacer()
                }
                if let r = store.installResult {
                    Text(r).font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary)
                }
                Text("自动配置 Claude Code / Codex / Gemini / Cursor / Windsurf / OpenCode;没覆盖到的由 📡 雷达兜底")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            // 进程雷达:补录没接 MCP 的本机会话
            HStack(spacing: 6) {
                Toggle(isOn: Binding(
                    get: { store.radarEnabled },
                    set: { store.setRadar(enabled: $0) }
                )) {
                    Text("📡 进程雷达").font(.system(size: 10, weight: .bold))
                }
                .toggleStyle(.checkbox)
                if store.radarEnabled {
                    Text(store.radarCount > 0 ? "已补录 \(store.radarCount) 个未接入的会话" : "扫描本机 Agent 会话中…")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .help("每 30 秒扫描本机 harness 进程,把没装 MCP 考勤的会话补录入册。只读进程表和文件时间戳。")
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if let u = store.updateURL {
                Button("⬆️ 新版本") {
                    if let url = URL(string: u) { openURL(url) }
                }
                .font(.system(size: 10, weight: .bold))
                .buttonStyle(.plain)
                .foregroundStyle(.orange)
                .help("有新版本可用,点击下载")
            }
            Button("看榜 ↗") {
                if let url = URL(string: "\(store.apiBase)/agents") { openURL(url) }
            }
            .font(.system(size: 11, weight: .bold))
            .buttonStyle(.plain)
            .foregroundStyle(.blue)
            Spacer()
            Button {
                Task { await store.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.plain)
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .help("刷新")
            Button("退出 App") { NSApplication.shared.terminate(nil) }
                .font(.system(size: 10))
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("关闭菜单栏应用(不是退出登录)。重新打开:Spotlight 搜 Agentosity")
        }
        .padding(.top, 2)
    }
}
