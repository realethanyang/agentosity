export async function main(argv) {
  const cmd = argv[0] ?? "help";
  switch (cmd) {
    case "help":
    default:
      console.log(`agentosity — AI-native is a number now.

Usage:
  agentosity init <company>   Configure company + install MCP config
  agentosity serve            Run stdio MCP attendance server (harness spawns this)
  agentosity status           Today's agent-hours
  agentosity clockout         Human clock-out (下班打卡)
`);
  }
}
