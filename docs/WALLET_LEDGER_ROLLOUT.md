# Wallet ledger rollout

## Điều kiện bắt buộc

- Backup MongoDB và xác nhận database chạy replica set/Atlas.
- Chặn API tài chính trong thời gian migration.
- Không chạy `syncIndexes()` trên production.
- Chạy dry-run trước: `npm run wallet-ledger:audit`.
- Chỉ sau khi kiểm tra backup và báo cáo dry-run mới chạy: `npm run wallet-ledger:migrate`.
- Cấu hình `NODE_ENV=production` để Mongoose không tự tạo index; migration sẽ tạo unique index sau khi gộp ví trùng.

## Feature flags

Mặc định các flag bật. Đặt `false` để khóa riêng từng nhóm trong quá trình rollout:

- `WALLET_LEDGER_DEPOSIT_ENABLED`
- `WALLET_LEDGER_BETTING_ENABLED`
- `WALLET_LEDGER_WITHDRAWAL_ENABLED`
- `WALLET_LEDGER_REGISTRATION_ENABLED`
- `WALLET_LEDGER_INVITATION_ENABLED`
- `WALLET_LEDGER_RACE_SETTLEMENT_ENABLED`

Thứ tự bật đề xuất: deposit → betting → withdrawal → registration/invitation → race settlement. Sau mỗi bước gọi `GET /api/v1/admin/wallet/reconciliation` và chỉ tiếp tục khi các sai lệch mới bằng 0.

## Integration test

Đặt `MONGODB_TEST_URI` trỏ tới database replica-set có chữ `test` trong tên rồi chạy `npm test`. Test ledger sẽ kiểm tra rollback, request đồng thời cùng idempotency key và chống chi vượt số dư. Nếu không có URI test, bộ test này được skip an toàn.
