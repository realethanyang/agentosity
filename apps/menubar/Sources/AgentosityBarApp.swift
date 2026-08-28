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

// MARK: - 配置(与 CLI 共用 ~/.agentosity/config.json)

struct CLIConfig: Codable {
    var company: String?
    var deviceId: String?
    var apiBase: String?
}

func loadCLIConfig() -> CLIConfig {
    let url = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".agentosity/config.json")
    guard let data = try? Data(contentsOf: url),
          let cfg = try? JSONDecoder().decode(CLIConfig.self, from: data)
    else { return CLIConfig() }
    return cfg
}

// MARK: - Store

@MainActor
final class Store: ObservableObject {
    @Published var liveTotal: Int?
    @Published var myCompanyRow: AgentsResponse.Row?
    @Published var liveAgents: [AgentsResponse.LiveAgent] = []
    @Published var clockedOut: String? // 打卡成功后的本地时间
    @Published var errorText: String?
    @Published var config = loadCLIConfig()

    var apiBase: String {
        if let env = ProcessInfo.processInfo.environment["AGENTOSITY_API"] { return env }
        return config.apiBase ?? "https://agentosity.com"
    }

    func refresh() async {
        config = loadCLIConfig()
        guard let url = URL(string: "\(apiBase)/api/agents") else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let resp = try JSONDecoder().decode(AgentsResponse.self, from: data)
            liveTotal = resp.live.total
            liveAgents = resp.live.by_company
            if let mine = config.company {
                myCompanyRow = resp.board.first { $0.name == mine }
            }
            errorText = nil
        } catch {
            errorText = "拿不到数据(网络/服务未部署?)"
        }
    }

    func clockOut() async {
        guard let company = config.company, let device = config.deviceId else {
            errorText = "先在终端跑:npx agentosity init <公司名>"
            return
        }
        do {
            // 查公司 id
            var comps = URLComponents(string: "\(apiBase)/api/companies")!
            comps.queryItems = [URLQueryItem(name: "q", value: company)]
            let (listData, _) = try await URLSession.shared.data(from: comps.url!)
            let list = try JSONDecoder().decode([Company].self, from: listData)
            guard let match = list.first(where: { $0.name == company }) ?? list.first else {
                errorText = "找不到公司「\(company)」"
                return
            }
            // 打卡
            var req = URLRequest(url: URL(string: "\(apiBase)/api/checkin")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "companyId": match.id, "deviceId": device,
            ])
            let (data, _) = try await URLSession.shared.data(for: req)
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
}

// MARK: - App

@main
struct AgentosityBarApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        MenuBarExtra {
            PopoverView(store: store)
        } label: {
            // 菜单栏常驻:🤖 + 在岗数,不点开也在讲故事
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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // 标题
            HStack {
                Text("Agentosity").font(.system(size: 18, weight: .black))
                Spacer()
                Text("AI-native is a number now.")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
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
                    } else if let company = store.config.company {
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
        .frame(width: 280)
        .task {
            await store.refresh()
        }
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in
            Task { await store.refresh() }
        }
    }
}
