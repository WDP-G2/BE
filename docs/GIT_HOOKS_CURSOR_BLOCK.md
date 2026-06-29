# Git hooks — chặn Cursor Agent

Sau `npm install` hoặc chạy `npm run setup-hooks`, repo tự cài:

| Hook | Tác dụng |
|------|----------|
| `commit-msg` | Gỡ / chặn `Co-authored-by: Cursor <cursoragent@cursor.com>` |
| `pre-push` | **Chặn push** nếu bất kỳ commit nào còn Cursor Agent |

Logic dùng chung: `scripts/block-cursor-agent.js`

## Ai bị chặn?

- Author/committer: `cursoragent@cursor.com`, tên `Cursor`, `Cursor Agent`
- Commit message có `Co-authored-by: Cursor`

## Sửa lịch sử cũ (nếu cần)

```bash
git filter-branch -f --msg-filter "node scripts/strip-coauthor-msg.js" main
git push --force-with-lease origin main
```
