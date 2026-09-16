# chat-links

Paseo plugin that lists Linear tickets and GitHub PRs mentioned in the current chat, then polls them for status and unread comments.

Requires Paseo 0.8 or later, with plugins enabled.

```bash
paseo plugin add AStox/paseo-chat-links
```

Or from a local checkout:

```bash
paseo plugin install /absolute/path/to/paseo-chat-links
```

Set these on the daemon (environment variables, not files in this repo):

- `GH_TOKEN` or `GITHUB_TOKEN`
- `LINEAR_API_KEY` (or Linear CLI credentials in `~/.config/linear/credentials.toml`)
- `TYPESAFE_API_KEY` (optional; ranks which mentions belong to the chat)
