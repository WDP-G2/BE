# Nghiệp vụ đặt cược (Betting) — Tài liệu giải thích chi tiết

Tài liệu này giải thích toàn bộ luồng nghiệp vụ, trạng thái, chính sách và API của tính năng đặt cược trong hệ thống. Đối tượng đọc: dev mới join, hoặc người cần hiểu lại toàn bộ luồng để bảo trì/mở rộng.

## 1. Các thực thể chính

### 1.1. `BetMarket` — "Kèo cược" của một cuộc đua

Mỗi cuộc đua (`race`) có tối đa **một** `BetMarket` (unique theo `raceId`). Đây là nơi cấu hình luật chơi cho cuộc đua đó: mức cược tối thiểu/tối đa, danh sách "lựa chọn" (mỗi con ngựa tham gia đua là một lựa chọn để cược vào).

File: `BE/models/betting.js`

| Trường | Ý nghĩa |
|---|---|
| `raceId` | Cuộc đua mà kèo cược này gắn vào |
| `status` | `DRAFT → OPEN → CLOSED → SETTLED` (xem mục 2) |
| `minStake` / `maxStake` | Số tiền cược tối thiểu / tối đa cho 1 lượt cược |
| `options[]` | Danh sách ngựa có thể cược, mỗi option gắn với `participantId` (chính là `_id` của bản ghi đăng ký/registration trong giải) |
| `openedAt` / `closedAt` / `settledAt` | Mốc thời gian chuyển trạng thái |

### 1.2. `Bet` — Một lượt cược của người xem

File: `BE/models/betting.js`

| Trường | Ý nghĩa |
|---|---|
| `marketId`, `raceId` | Cược thuộc kèo cược / cuộc đua nào |
| `userId` | Người đặt cược (role `SPECTATOR`/`USER`) |
| `participantId` | Người dùng cược cho ngựa nào (khớp với `options[].participantId` của market) |
| `stakeAmount` | Số tiền cược |
| `potentialPayoutAmount` | Số tiền **có thể** nhận nếu thắng (hiện tại = `stakeAmount × 2`, xem mục 5 — hạn chế hiện tại) |
| `winningTaxAmount` | Số thuế bị trừ trên phần **lãi** nếu thắng (tính lúc chốt cược) |
| `grossProfitAmount` | Lãi gộp = `potentialPayoutAmount − stakeAmount` (chưa trừ thuế) |
| `netProfitAmount` | Lãi ròng = `grossProfitAmount − winningTaxAmount` |
| `status` | `PLACED → LOCKED → (WON \| LOST \| REFUNDED \| CANCELLED)` |

### 1.3. Ví (`Wallet`) và giao dịch (`WalletTransaction`)

File: `BE/models/wallet.js`, logic: `BE/services/walletLedger.js`

Mỗi user có 1 ví với 2 số dư:
- `availableBalance`: tiền khả dụng, có thể dùng để đặt cược/rút tiền.
- `holdBalance`: tiền đang bị "giữ" (đã cam kết cho một lượt cược đang chờ kết quả), **không** dùng được cho việc khác.

Ngoài ra có một **ví hệ thống** (`ownerType: "SYSTEM"`) đóng vai trò nhà cái — nơi thu tiền cược thua và thuế, chi tiền thắng cược.

## 2. Vòng đời một kèo cược (BetMarket)

```
DRAFT ──(admin mở)──▶ OPEN ──(admin đóng)──▶ CLOSED ──(admin chốt)──▶ SETTLED
```

1. **DRAFT** — Admin tạo kèo cược cho một cuộc đua (`POST /admin/races/:raceId/bet-market`). Hệ thống tự lấy danh sách ngựa đã được duyệt tham gia đua (`getApprovedParticipants`) làm `options`. Ở trạng thái này, spectator **chưa** cược được.
2. **OPEN** — Admin bấm "Mở kèo cược" (`PUT /admin/bet-markets/:id/open`). Từ lúc này spectator mới thấy market trong danh sách "cuộc đua có thể cược" và đặt cược được.
3. **CLOSED** — Admin bấm "Đóng kèo cược" (`PUT /admin/bet-markets/:id/close`), thường làm ngay trước/khi cuộc đua bắt đầu để không ai cược thêm sau khi biết trước kết quả. Từ lúc này không đặt cược mới được, nhưng cược cũ vẫn ở trạng thái `PLACED` chờ chốt.
4. **SETTLED** — Sau khi trọng tài nhập kết quả đua (`race.results`, race chuyển `RESULT_CONFIRMED`), admin bấm "Chốt kết quả cược" (`PUT /admin/bet-markets/:id/settle`). Hệ thống tự động xử lý **toàn bộ** cược trong market này (xem mục 3). Một khi đã `SETTLED`, không thể chốt lại lần 2 (có chặn).

> Lưu ý: Backend hiện **không tự động** chuyển trạng thái theo thời gian — mọi chuyển trạng thái đều do admin bấm tay. Đây là điểm cần lưu ý nếu muốn tự động hoá sau này (ví dụ tự đóng kèo khi race bắt đầu).

## 3. Luồng đặt cược (Spectator)

File: `BE/controllers/bettingController.js` (`placeBet`)

1. Kiểm tra **cấu hình hệ thống**: nếu admin đã tắt tính năng cược (`bettingEnabled = false`, xem mục 6), trả lỗi 403 ngay — không cho đặt cược dù market có OPEN hay không.
2. Tìm `BetMarket` theo `raceId` với `status = OPEN`. Không có → lỗi "Market cược chưa mở".
3. Validate `participantId` (phải nằm trong `options[]` của market) và `stakeAmount` (phải nằm trong khoảng `[minStake, maxStake]`).
4. **Giữ tiền** (`holdStake`): trừ `stakeAmount` khỏi `availableBalance`, cộng vào `holdBalance` của user. Nếu `availableBalance` không đủ → lỗi "Số dư ví không đủ để đặt cược". Đồng thời ghi 1 `WalletTransaction` loại `BET_STAKE` (âm) để lưu lịch sử.
5. Tạo bản ghi `Bet` với `status = PLACED`, `potentialPayoutAmount = stakeAmount × 2`.

Một user có thể đặt **nhiều lượt cược** vào cùng một market (kể cả cược vào nhiều ngựa khác nhau trong cùng 1 race) — hệ thống không chặn trùng lặp.

## 4. Luồng chốt cược (Settlement) — phần lõi nghiệp vụ

File: `BE/services/bettingSettlementService.js` (`settleMarket`), được gọi từ `PUT /admin/bet-markets/:id/settle`.

### 4.1. Điều kiện được phép chốt

- Market phải đang ở trạng thái `OPEN` hoặc `CLOSED` (không phải `DRAFT`, không phải đã `SETTLED`).
- Cuộc đua gắn với market phải đã có kết quả (`race.results` có ít nhất 1 dòng `position = 1`), **trừ khi** cuộc đua đã bị huỷ (`status = CANCELLED`) — trường hợp đó sẽ hoàn tiền toàn bộ thay vì xác định thắng/thua.

### 4.2. Xác định người thắng

Trong `race.results`, dòng có `position = 1` chính là ngựa về nhất. `participantId` của dòng này được so khớp với `participantId` của từng `Bet` đang `PLACED`/`LOCKED` trong market:

- **Trùng** → cược đó **thắng** (`WON`).
- **Không trùng** → cược đó **thua** (`LOST`).
- Nếu đua bị **huỷ** hoặc không xác định được ai về nhất → **hoàn tiền** (`REFUNDED`) cho tất cả các cược, không phân biệt thắng thua.

> Quan trọng: kết quả đua phải có `participantId` được gán đúng (BE tự gán khi trọng tài nhập kết quả qua `refereeController.js`, field này trỏ tới `_id` của registration). Nếu dữ liệu đua cũ/nhập tay thiếu `participantId`, hệ thống sẽ không xác định được ai thắng và sẽ coi như "chưa có kết quả" → không cho chốt.

### 4.3. Tính tiền cho từng trường hợp

Cho một cược có `stakeAmount = S`, `potentialPayoutAmount = P` (mặc định `P = S × 2`), và `taxPercent = T`% (lấy từ cấu hình hệ thống, xem mục 6):

**Trường hợp THẮNG (`WON`):**
```
grossProfit = P - S                         // lãi gộp
tax         = round(grossProfit × T / 100)  // thuế trên phần lãi
netProfit   = grossProfit - tax             // lãi ròng, người chơi thực nhận
actualPayout = S + netProfit                // tổng tiền cộng vào ví người chơi
```
- Ví người chơi: `holdBalance -= S` (giải phóng tiền giữ), `availableBalance += actualPayout`.
- Ví hệ thống: `availableBalance -= netProfit` (nhà cái trả phần lãi ròng cho người thắng; phần thuế `tax` nhà cái **giữ lại**, không phải trả thêm).
- Bet: `status = WON`, `winningTaxAmount = tax`, `grossProfitAmount = grossProfit`, `netProfitAmount = netProfit`.

*Ví dụ:* cược 100.000đ, tiềm năng 200.000đ, thuế 20% → lãi gộp 100.000đ, thuế 20.000đ, lãi ròng 80.000đ → người chơi nhận về tổng **180.000đ** (gốc 100.000 + lãi ròng 80.000).

**Trường hợp THUA (`LOST`):**
- Ví người chơi: `holdBalance -= S`, `availableBalance` **không đổi** (tiền cược đã mất, trước đó đã bị trừ khỏi `availableBalance` lúc đặt cược).
- Ví hệ thống: `availableBalance += S` (nhà cái thu toàn bộ tiền cược thua).
- Bet: `status = LOST`, `grossProfitAmount = -S`, `netProfitAmount = -S`.

**Trường hợp HOÀN TIỀN (`REFUNDED`)** — khi đua bị huỷ hoặc chưa xác định được kết quả:
- Ví người chơi: `holdBalance -= S`, `availableBalance += S` (trả lại nguyên tiền cược).
- Ví hệ thống: không thay đổi.
- Bet: `status = REFUNDED`, lãi = 0.

### 4.4. Sau khi xử lý xong tất cả các cược

Market chuyển `status = SETTLED`, ghi `settledAt`. Từ đây market này không thể chốt lại (gọi lại API sẽ báo lỗi "Kèo cược đã được chốt").

## 5. Bảng trạng thái Bet đầy đủ

| Status | Ý nghĩa | Khi nào xảy ra |
|---|---|---|
| `PLACED` | Đã đặt cược, tiền đang bị giữ, chờ chốt | Ngay sau khi `placeBet` thành công |
| `LOCKED` | (dự trù cho tương lai — hiện chưa có nơi nào gán trạng thái này) | — |
| `WON` | Thắng cược, đã nhận tiền | Sau khi `settleMarket` xác định đúng ngựa về nhất |
| `LOST` | Thua cược, mất tiền cược | Sau khi `settleMarket` xác định sai ngựa về nhất |
| `REFUNDED` | Được hoàn tiền | Đua bị huỷ hoặc không có kết quả hợp lệ khi chốt |
| `CANCELLED` | (dự trù cho tương lai — hiện chưa có luồng nào huỷ cược thủ công) | — |

## 6. Chính sách cấu hình (Policy) — Admin cấu hình được gì

File: `BE/models/systemSettings.js`, `BE/utils/financeSettingsMapper.js`, controller: `BE/controllers/admin/settingsController.js`

Đây là **cấu hình toàn hệ thống**, dùng chung cho mọi kèo cược (không cấu hình riêng theo từng race):

### 6.1. Bật/tắt tính năng cược — `bettingEnabled`

- API: `GET/PUT /admin/finance-settings`
- Khi `false`: toàn bộ API đặt cược (`placeBet`) bị chặn ngay từ đầu (403 "Tính năng đặt cược hiện đang tắt"), **bất kể** market đang ở trạng thái OPEN hay không.
- Đây là công tắc khẩn cấp (kill-switch) cấp toàn hệ thống, không phải bật/tắt theo từng race.

### 6.2. Thuế thắng cược — `betWinningTaxPercent`

- Lưu trong `fees.winningTaxPercent` của `SystemSettings` (mặc định 10%).
- Áp dụng khi chốt cược, tính trên **phần lãi gộp** (không tính trên tổng tiền nhận về) — xem công thức mục 4.3.
- Thay đổi giá trị này **chỉ ảnh hưởng các lần chốt cược sau đó** — các cược đã `SETTLED` trước đó giữ nguyên số liệu cũ (không truy hồi).

### 6.3. Chia thưởng theo thứ hạng đua — `racePrizeShares`

- API: `GET/PUT /admin/finance-settings/race-prize-shares`
- Mỗi dòng gồm `rank` (thứ hạng 1, 2, 3, ...) và `jockeyPercent` (% tiền thưởng của thứ hạng đó dành cho jockey); phần còn lại `ownerPercent = 100 − jockeyPercent` do BE tự tính, không lưu trực tiếp.
- **Lưu ý quan trọng:** đây hiện tại **chỉ là cấu hình được lưu trữ**, có API để đọc/ghi, nhưng **chưa có nơi nào trong hệ thống thực sự dùng nó để chia tiền thưởng** cho jockey/chủ ngựa. Tiền thưởng đua (`prizeAmountForRank`) hiện chỉ được **hiển thị** ở các màn hình kết quả (referee, chủ ngựa), chưa có luồng tự động cộng tiền vào ví jockey/owner. Đây là phần cần làm thêm nếu muốn tính năng "trả thưởng đua" hoạt động thật.

## 7. Danh sách API

### 7.1. Public / Spectator

| Method | Path | Chức năng |
|---|---|---|
| GET | `/races/:raceId/bet-market` | Xem kèo cược (chỉ khi `OPEN`) |
| GET | `/races/:raceId/results` | Xem kết quả đua (dùng để hiển thị ai thắng) |
| GET | `/users/me/bettable-races` | Danh sách market đang `OPEN` để cược |
| POST | `/races/:raceId/bets` | Đặt cược |
| GET | `/users/me/bets` | Lịch sử cược của tôi |
| GET | `/bets/:id` | Chi tiết 1 cược |

### 7.2. Admin

| Method | Path | Chức năng |
|---|---|---|
| POST | `/admin/races/:raceId/bet-market` | Tạo kèo cược cho 1 race (idempotent — gọi lại trả về market đã có, không tạo trùng) |
| GET | `/admin/bet-markets` | Danh sách tất cả market |
| PUT | `/admin/bet-markets/:id/open` | Mở kèo cược |
| PUT | `/admin/bet-markets/:id/close` | Đóng kèo cược (ngừng nhận cược mới) |
| PUT | `/admin/bet-markets/:id/settle` | **Chốt kết quả** — trả thưởng/thu tiền thua/hoàn tiền tự động |
| GET | `/admin/bet-markets/:id/bets` | Danh sách cược trong 1 market |
| GET/PUT | `/admin/finance-settings` | Bật/tắt cược + % thuế thắng cược |
| GET/PUT | `/admin/finance-settings/race-prize-shares` | Cấu hình chia thưởng theo thứ hạng (chưa được dùng để trả tiền thật, xem 6.3) |

## 8. Sơ đồ luồng tổng quát (end-to-end)

```
[Admin]                         [Spectator]                      [Hệ thống]
   |                                 |                                |
   |-- Tạo bet market (DRAFT) ------>|                                |
   |-- Mở kèo cược (OPEN) ---------->|                                |
   |                                 |-- Xem market đang mở --------->|
   |                                 |-- Đặt cược (POST /bets) ------>|
   |                                 |                                |-- check bettingEnabled
   |                                 |                                |-- check market OPEN
   |                                 |                                |-- check stake hợp lệ
   |                                 |                                |-- giữ tiền (hold)
   |                                 |                                |-- tạo Bet PLACED
   |-- Đóng kèo cược (CLOSED) ------>|                                |
   |   (không ai cược thêm được)     |                                |
   |                                 |                                |
[Trọng tài] -- Nhập kết quả đua ---------------------------------->  |
   |   (race.results, participantId gắn theo từng ngựa)              |
   |                                 |                                |
   |-- Chốt kết quả cược (SETTLED) ----------------------------->    |
   |                                 |                                |-- so participantId thắng
   |                                 |                                |-- WON: trả thưởng (trừ thuế)
   |                                 |                                |-- LOST: thu tiền cược
   |                                 |                                |-- (nếu huỷ đua: REFUND hết)
   |                                 |<-- Ví cập nhật, lịch sử cược --|
```

## 9. Hạn chế hiện tại (điểm cần biết khi mở rộng)

1. **Không có tỷ lệ cược (odds) thực sự** — `potentialPayoutAmount` luôn cố định `stake × 2` cho mọi lựa chọn, không phản ánh xác suất thắng thực tế của từng ngựa (ngựa yếu và ngựa mạnh có cùng tỷ lệ trả thưởng). Muốn làm odds động cần thêm logic tính theo tổng tiền cược vào mỗi lựa chọn (kiểu pari-mutuel) hoặc theo phong độ ngựa.
2. **Không tự động chuyển trạng thái theo thời gian** — admin phải tự tay mở/đóng/chốt từng market; không có cron job tự đóng kèo khi race bắt đầu hay tự chốt khi có kết quả.
3. **`racePrizeShares` chưa được dùng để trả tiền thật** — mới dừng ở mức cấu hình lưu trữ (xem mục 6.3).
4. **Không giới hạn số lượt cược/tổng tiền cược của 1 user trên 1 market** — có thể cược nhiều lần, nhiều lựa chọn khác nhau không giới hạn (miễn còn đủ số dư).
5. **Trạng thái `LOCKED` và `CANCELLED`** tồn tại trong schema nhưng chưa có luồng nghiệp vụ nào gán các trạng thái này.
