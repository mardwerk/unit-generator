// Command-model fixture for a real cancellation check. No disk or network access.
for await (const chunk of process.stdin) {
  void chunk;
}
await new Promise((resolve) => setTimeout(resolve, 30_000));
process.stdout.write('{}');
