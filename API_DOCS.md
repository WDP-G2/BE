# API Documentation — Horse Racing Backend

**Base URL:** `http://localhost:3000/api/v1`  
**Server port:** `3000`  
**Chạy server:** `cd BE && npm install && npm start`

---

## Hướng dẫn test với Postman

### Bước 1: Cài đặt Postman
Tải tại [https://www.postman.com/downloads/](https://www.postman.com/downloads/)

### Bước 2: Tạo Environment
1. Mở Postman → nhấn **Environments** (góc trái) → **+**
2. Đặt tên: `Horse Racing Local`
3. Thêm các variables:

| Variable | Initial Value | Current Value |
|----------|--------------|---------------|
| `baseUrl` | `http://localhost:3000/api/v1` | `http://localhost:3000/api/v1` |
| `token` | _(để trống)_ | _(để trống — sẽ tự điền sau login)_ |

4. Nhấn **Save** → chọn Environment này ở góc phải trên

### Bước 3: Lấy token tự động sau khi login
Tạo request **POST Login**, vào tab **Tests**, dán script sau:
```javascript
var json = pm.response.json();
if (json.data && json.data.token) {
    pm.environment.set("token", json.data.token);
}
```
Sau đó mọi request có Auth chỉ cần dùng `{{token}}`.

### Bước 4: Cấu hình Authorization cho Collection
1. Tạo **Collection** mới → **Authorization** tab
2. Type: **Bearer Token**
3. Token: `{{token}}`
4. Tất cả request trong collection sẽ tự dùng token này (chọn **Inherit auth from parent**)

---

## Format Response chung

Tất cả API trả về định dạng:
```json
{
  "success": true,
  "message": "Success",
  "data": { ... }
}
```

Khi lỗi:
```json
{
  "success": false,
  "message": "Error message"
}
```

---

## 1. Auth — Xác thực

Base: `/api/v1/auth`

### POST `/auth/register` — Đăng ký
**Auth:** Không cần

**Body (JSON):**
```json
{
  "email": "user@example.com",
  "password": "123456",
  "fullName": "Nguyen Van A",
  "username": "nguyenvana",
  "phone": "0901234567"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registered successfully",
  "data": {
    "token": "eyJhbGci...",
    "accessToken": "eyJhbGci...",
    "user": {
      "id": "...",
      "email": "user@example.com",
      "fullName": "Nguyen Van A",
      "role": "USER"
    }
  }
}
```

---

### POST `/auth/login` — Đăng nhập
**Auth:** Không cần

**Body (JSON):**
```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

> Dán script vào tab **Tests** để tự lưu token:
> ```javascript
> var json = pm.response.json();
> if (json.data && json.data.token) {
>     pm.environment.set("token", json.data.token);
> }
> ```

---

### GET `/auth/me` — Lấy thông tin user hiện tại
**Auth:** Bearer Token `{{token}}`

---

### PUT `/auth/password` — Đổi mật khẩu
**Auth:** Bearer Token

**Body (JSON):**
```json
{
  "currentPassword": "123456",
  "newPassword": "654321"
}
```

---

### POST `/auth/logout` — Đăng xuất
**Auth:** Không cần

---

### POST `/auth/forgot-password` — Quên mật khẩu
**Body (JSON):**
```json
{ "email": "user@example.com" }
```

---

### POST `/auth/reset-password` — Reset mật khẩu
**Body (JSON):**
```json
{
  "token": "otp-token",
  "newPassword": "newpassword123"
}
```

---

### POST `/auth/google` — Đăng nhập Google
**Body (JSON):**
```json
{ "idToken": "google-id-token-from-firebase" }
```

---

### POST `/auth/facebook` — Đăng nhập Facebook
**Body (JSON):**
```json
{ "accessToken": "facebook-access-token" }
```

---

### POST `/auth/2fa/verify` — Xác minh 2FA
**Body (JSON):**
```json
{ "challengeToken": "otp-code" }
```

---

### POST `/auth/2fa/resend` — Gửi lại mã 2FA
**Body (JSON):**
```json
{ "email": "user@example.com" }
```

---

## 2. Users — Người dùng

### GET `/users/me/profile` — Profile của tôi
**Auth:** Bearer Token

---

### PUT `/users/me/profile` — Cập nhật profile
**Auth:** Bearer Token  
**Body (form-data hoặc JSON):**
```json
{
  "fullName": "Nguyen Van B",
  "phone": "0909999999"
}
```

---

### GET `/users/jockeys` — Danh sách jockey
**Auth:** Không cần

---

### GET `/admin/users` — (Admin) Tất cả users
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/users/active` — (Admin) Users đang active
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/users/deactivated` — (Admin) Users đã bị vô hiệu
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/users/:id` — (Admin) Chi tiết user
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/users/:userId/role` — (Admin) Đổi role user
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{ "role": "JOCKEY" }
```

> Các role hợp lệ: `USER`, `ADMIN`, `OWNER`, `JOCKEY`, `REFEREE`, `SPECTATOR`

---

### PUT `/admin/users/:userId/activate` — (Admin) Kích hoạt user
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/users/:userId/deactivate` — (Admin) Vô hiệu hóa user
**Auth:** Bearer Token (role ADMIN)

---

## 3. News — Tin tức

### GET `/news` — Danh sách tin đã published
**Auth:** Không cần

**Query params tùy chọn:**
```
?search=từ khóa
?category=Tin tức
?featured=true
```

---

### GET `/news/all` — Tất cả tin (kể cả draft)
**Auth:** Không cần

---

### GET `/news/:id` — Chi tiết tin (theo ID hoặc slug)
**Auth:** Không cần

**Ví dụ:** `GET /api/v1/news/6703abc123def456789012ab`  
hoặc: `GET /api/v1/news/tin-tuc-giai-dua-mua-he`

---

### POST `/admin/news` — (Admin) Tạo tin mới
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "title": "Giải đua ngựa mùa hè 2025",
  "summary": "Tóm tắt ngắn về bài viết",
  "content": "Nội dung đầy đủ của bài viết...",
  "category": "Tin tức",
  "thumbnail": "https://example.com/image.jpg",
  "featured": false,
  "status": "published"
}
```

> `status`: `draft` | `published` | `archived`

---

### GET `/admin/news` — (Admin) Tất cả tin
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/news/:id` — (Admin) Chi tiết tin
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/news/:id` — (Admin) Cập nhật tin
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):** _(chỉ gửi các field muốn cập nhật)_
```json
{
  "title": "Tiêu đề mới",
  "status": "archived"
}
```

---

### DELETE `/admin/news/:id` — (Admin) Xóa tin
**Auth:** Bearer Token (role ADMIN)

---

## 4. Tournaments — Giải đấu

### GET `/tournaments` — Danh sách giải đấu (public)
**Auth:** Không cần

---

### GET `/tournaments/:id` — Chi tiết giải đấu
**Auth:** Không cần

---

### GET `/tournaments/:id/races` — Danh sách cuộc đua trong giải
**Auth:** Không cần

---

### GET `/tournaments/:id/leaderboard` — Bảng xếp hạng giải
**Auth:** Không cần

---

### GET `/tournaments/:id/jockey-challenge` — Thách đấu jockey
**Auth:** Không cần

---

### POST `/admin/tournaments` — (Admin) Tạo giải đấu
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "name": "Giải đua ngựa Hà Nội 2025",
  "description": "Mô tả giải đấu",
  "startDate": "2025-08-01T08:00:00Z",
  "endDate": "2025-08-03T18:00:00Z",
  "location": "Trường đua Phú Thọ",
  "status": "Nháp",
  "maxParticipants": 20,
  "entryFee": 500000
}
```

---

### GET `/admin/tournaments` — (Admin) Tất cả giải đấu
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/tournaments/:id` — (Admin) Chi tiết giải
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/tournaments/:id` — (Admin) Cập nhật giải
**Auth:** Bearer Token (role ADMIN)

---

### DELETE `/admin/tournaments/:id` — (Admin) Xóa giải
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/tournaments/:id/status` — (Admin) Cập nhật trạng thái
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{ "status": "Đang diễn ra" }
```

---

### PUT `/admin/tournaments/:id/open-registration` — (Admin) Mở đăng ký
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/tournaments/:id/close-registration` — (Admin) Đóng đăng ký
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/tournaments/:id/finalize` — (Admin) Kết thúc giải
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/tournaments/:id/statistics` — (Admin) Thống kê giải
**Auth:** Bearer Token (role ADMIN)

---

### POST `/admin/tournaments/:id/races` — (Admin) Tạo cuộc đua
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "name": "Vòng 1",
  "raceNumber": 1,
  "distance": 1200,
  "scheduledAt": "2025-08-01T09:00:00Z"
}
```

---

### PUT `/admin/races/:raceId` — (Admin) Cập nhật cuộc đua
**Auth:** Bearer Token (role ADMIN)

---

### DELETE `/admin/races/:raceId` — (Admin) Xóa cuộc đua
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/tournaments/:id/schedule` — (Admin) Lên lịch giải
**Auth:** Bearer Token (role ADMIN)

---

### POST `/admin/tournament-banners` — (Admin) Upload banner
**Auth:** Bearer Token (role ADMIN)  
**Body:** `form-data` với key `banner` là file ảnh

---

## 5. Horses — Ngựa

### GET `/horses/approved` — Ngựa được phê duyệt (public)
**Auth:** Không cần

---

### GET `/horses/:id` — Chi tiết ngựa
**Auth:** Không cần

---

### GET `/owner/horses` — Ngựa của owner
**Auth:** Bearer Token (role OWNER)

---

### GET `/owner/horses/:id` — Chi tiết ngựa của owner
**Auth:** Bearer Token (role OWNER)

---

### POST `/owner/horses` — Thêm ngựa mới
**Auth:** Bearer Token (role OWNER)

**Body (JSON):**
```json
{
  "name": "Thunder",
  "breed": "Thoroughbred",
  "age": 4,
  "color": "Bay",
  "weight": 500,
  "height": 165,
  "description": "Ngựa đua chuyên nghiệp"
}
```

---

### PUT `/owner/horses/:id` — Cập nhật ngựa
**Auth:** Bearer Token (role OWNER)

---

### DELETE `/owner/horses/:id` — Xóa ngựa
**Auth:** Bearer Token (role OWNER)

---

### GET `/admin/horses` — (Admin) Tất cả ngựa
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/horses/:id/approve` — (Admin) Phê duyệt ngựa
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/horses/:id/reject` — (Admin) Từ chối ngựa
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/horses/:id/suspend` — (Admin) Đình chỉ ngựa
**Auth:** Bearer Token (role ADMIN)

---

## 6. Race Registrations — Đăng ký đua

### POST `/races/:id/registrations` — Đăng ký tham gia cuộc đua
**Auth:** Bearer Token (role OWNER)

**Body (JSON):**
```json
{
  "horseId": "horse-id-here",
  "jockeyId": "jockey-id-here"
}
```

---

### GET `/owner/race-registrations` — Đăng ký của owner
**Auth:** Bearer Token (role OWNER)

---

### PUT `/owner/race-registrations/:id/withdraw` — Rút đăng ký
**Auth:** Bearer Token (role OWNER)

---

### GET `/admin/tournaments/:id/race-registrations` — (Admin) DS đăng ký giải
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/race-registrations/:id/approve` — (Admin) Duyệt đăng ký
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/race-registrations/:id/reject` — (Admin) Từ chối đăng ký
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/races/:id/participants` — (Admin) DS tham gia cuộc đua
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/races/:id/cancel` — (Admin) Hủy cuộc đua
**Auth:** Bearer Token (role ADMIN)

---

## 7. Race Day — Ngày đua (Referee)

### GET `/referee/races` — Cuộc đua của trọng tài
**Auth:** Bearer Token (role REFEREE)

---

### GET `/referee/races/today` — Cuộc đua hôm nay
**Auth:** Bearer Token (role REFEREE)

---

### GET `/referee/payments` — Lịch sử thanh toán trọng tài
**Auth:** Bearer Token (role REFEREE)

---

### GET `/referee/races/:id/participants` — Danh sách tham gia
**Auth:** Bearer Token (role REFEREE)

---

### PUT `/referee/races/:id/participants/:participantId/gate` — Gán cổng xuất phát
**Auth:** Bearer Token (role REFEREE)

**Body (JSON):**
```json
{ "gate": 3 }
```

---

### PUT `/referee/races/:id/participants/:participantId/check-in` — Check-in
**Auth:** Bearer Token (role REFEREE)

---

### PUT `/referee/races/:id/start` — Bắt đầu cuộc đua
**Auth:** Bearer Token (role REFEREE)

---

### POST `/referee/races/:id/results/finalize` — Chốt kết quả
**Auth:** Bearer Token (role REFEREE)

**Body (JSON):**
```json
{
  "results": [
    { "participantId": "...", "position": 1, "finishTime": "1:23.456" },
    { "participantId": "...", "position": 2, "finishTime": "1:24.001" }
  ]
}
```

---

### GET `/races/:id/results` — Kết quả cuộc đua (public)
**Auth:** Không cần

---

### POST `/races/:id/complaints` — Nộp khiếu nại
**Auth:** Bearer Token

**Body (form-data):**
```
reason: "Ngựa số 3 xuất phát sớm"
```

---

### GET `/owner/race-complaints` — Khiếu nại của owner
**Auth:** Bearer Token (role OWNER)

---

### GET `/admin/race-complaints` — (Admin) Tất cả khiếu nại
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/race-complaints/:id/resolve` — (Admin) Giải quyết khiếu nại
**Auth:** Bearer Token (role ADMIN)

---

## 8. Role Applications — Đăng ký vai trò

### POST `/role-applications/owner` — Đăng ký làm Owner
**Auth:** Bearer Token  
**Body:** `form-data` (có thể đính kèm file giấy tờ)
```
businessName: "Trại ngựa ABC"
description: "Mô tả"
```

---

### POST `/role-applications/jockey` — Đăng ký làm Jockey
**Auth:** Bearer Token  
**Body:** `form-data`
```
experience: "5 năm kinh nghiệm"
certifications: "Chứng chỉ đua ngựa quốc gia"
```

---

### POST `/role-applications/spectator` — Đăng ký làm Spectator
**Auth:** Bearer Token

---

### POST `/role-applications/referee` — Đăng ký làm Referee
**Auth:** Bearer Token  
**Body:** `form-data`

---

### POST `/role-applications/kyc/ocr` — Upload CCCD/CMND (OCR)
**Auth:** Bearer Token  
**Body:** `form-data` với file ảnh CCCD

---

### POST `/role-applications/kyc/:kycVerificationId/face-match` — Xác minh khuôn mặt
**Auth:** Bearer Token  
**Body:** `form-data` với file ảnh selfie

---

### GET `/role-applications/me` — Đơn đăng ký của tôi
**Auth:** Bearer Token

---

### GET `/admin/role-applications` — (Admin) Tất cả đơn
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/role-applications/role/:role` — (Admin) Lọc theo role
**Auth:** Bearer Token (role ADMIN)  
**Ví dụ:** `/admin/role-applications/role/JOCKEY`

---

### GET `/admin/role-applications/status/:status` — (Admin) Lọc theo trạng thái
**Auth:** Bearer Token (role ADMIN)  
**Ví dụ:** `/admin/role-applications/status/PENDING`

---

### PUT `/admin/role-applications/:profileId/approve` — (Admin) Duyệt đơn
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/role-applications/:profileId/reject` — (Admin) Từ chối đơn
**Auth:** Bearer Token (role ADMIN)

---

## 9. Jockey — Nài ngựa

### GET `/jockey/profile` — Profile jockey của tôi
**Auth:** Bearer Token (role JOCKEY)

---

### PUT `/jockey/profile` — Cập nhật profile jockey
**Auth:** Bearer Token (role JOCKEY)  
**Body:** `form-data` hoặc JSON

---

### GET `/jockeys/available` — Danh sách jockey sẵn sàng
**Auth:** Không cần

---

### GET `/jockeys/:id` — Thông tin jockey
**Auth:** Không cần

---

### GET `/admin/jockey-profiles` — (Admin) Tất cả jockey
**Auth:** Bearer Token (role ADMIN)

---

### POST `/owner/jockey-invitations` — Mời jockey
**Auth:** Bearer Token (role OWNER)

**Body (JSON):**
```json
{
  "jockeyId": "jockey-user-id",
  "horseId": "horse-id",
  "message": "Mời bạn tham gia cùng ngựa Thunder"
}
```

---

### GET `/owner/jockey-invitations` — DS lời mời đã gửi
**Auth:** Bearer Token (role OWNER)

---

### PUT `/owner/jockey-invitations/:id/cancel` — Hủy lời mời
**Auth:** Bearer Token (role OWNER)

---

### GET `/jockey/invitations` — Lời mời nhận được
**Auth:** Bearer Token (role JOCKEY)

---

### PUT `/jockey/invitations/:id/accept` — Chấp nhận lời mời
**Auth:** Bearer Token (role JOCKEY)

---

### PUT `/jockey/invitations/:id/reject` — Từ chối lời mời
**Auth:** Bearer Token (role JOCKEY)

---

### GET `/owners/me/jockeys` — Jockey trong đội của owner
**Auth:** Bearer Token (role OWNER)

---

### GET `/rankings` — Bảng xếp hạng (public)
**Auth:** Không cần

---

## 10. Referee — Trọng tài

### POST `/admin/referee-invitations` — (Admin) Mời trọng tài
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "refereeId": "user-id",
  "raceId": "race-id",
  "date": "2025-08-01"
}
```

---

### GET `/admin/referee-invitations` — (Admin) DS lời mời trọng tài
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/referee-invitations/:id/cancel` — (Admin) Hủy lời mời
**Auth:** Bearer Token (role ADMIN)

---

### GET `/referee/invitations` — Lời mời trọng tài của tôi
**Auth:** Bearer Token (role REFEREE)

---

### PUT `/referee/invitations/:id/accept` — Chấp nhận làm trọng tài
**Auth:** Bearer Token (role REFEREE)

---

### PUT `/referee/invitations/:id/reject` — Từ chối
**Auth:** Bearer Token (role REFEREE)

---

### POST `/admin/referee-salary-configs` — (Admin) Tạo cấu hình lương
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "name": "Lương cơ bản",
  "baseSalary": 500000,
  "bonusPerRace": 100000
}
```

---

### GET `/admin/referee-salary-configs` — (Admin) DS cấu hình lương
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/referee-salary-configs/:id` — (Admin) Cập nhật cấu hình
**Auth:** Bearer Token (role ADMIN)

---

### DELETE `/admin/referee-salary-configs/:id` — (Admin) Xóa cấu hình
**Auth:** Bearer Token (role ADMIN)

---

## 11. Wallet & Payment — Ví và thanh toán

### GET `/wallets/me` — Ví của tôi
**Auth:** Bearer Token

---

### GET `/wallets/me/transactions` — Lịch sử giao dịch
**Auth:** Bearer Token

---

### POST `/wallets/me/deposit-orders` — Tạo lệnh nạp tiền
**Auth:** Bearer Token

**Body (JSON):**
```json
{
  "amount": 1000000,
  "method": "BANK_TRANSFER"
}
```

---

### GET `/wallets/me/deposit-orders` — DS lệnh nạp
**Auth:** Bearer Token

---

### POST `/wallets/me/withdrawals` — Yêu cầu rút tiền
**Auth:** Bearer Token

**Body (JSON):**
```json
{
  "amount": 500000,
  "bankAccount": "1234567890",
  "bankName": "Vietcombank"
}
```

---

### GET `/wallets/me/withdrawals` — DS yêu cầu rút
**Auth:** Bearer Token

---

### GET `/admin/withdrawals` — (Admin) Tất cả yêu cầu rút
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/withdrawals/:id/approve` — (Admin) Duyệt rút tiền
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/withdrawals/:id/reject` — (Admin) Từ chối rút
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/withdrawals/:id/mark-paid` — (Admin) Đánh dấu đã trả
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/wallet` — (Admin) Ví hệ thống
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/wallet/transactions` — (Admin) Giao dịch hệ thống
**Auth:** Bearer Token (role ADMIN)

---

### POST `/payment-callbacks/deposits` — Callback thanh toán (webhook)
**Auth:** Không cần (gọi từ cổng thanh toán)

---

### GET `/admin/payment-orders` — (Admin) DS đơn thanh toán
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/payment-callback-logs` — (Admin) Log callback
**Auth:** Bearer Token (role ADMIN)

---

## 12. Betting — Cá cược

### GET `/races/:raceId/bet-market` — Thị trường cược của cuộc đua
**Auth:** Không cần

---

### GET `/users/me/bettable-races` — Cuộc đua có thể cược
**Auth:** Bearer Token

---

### POST `/races/:raceId/bets` — Đặt cược
**Auth:** Bearer Token

**Body (JSON):**
```json
{
  "marketId": "market-id",
  "horseId": "horse-id",
  "amount": 100000,
  "betType": "WIN"
}
```

---

### GET `/users/me/bets` — DS cược của tôi
**Auth:** Bearer Token

---

### GET `/bets/:id` — Chi tiết lệnh cược
**Auth:** Bearer Token

---

### POST `/admin/races/:raceId/bet-market` — (Admin) Tạo thị trường cược
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/bet-markets/:id/open` — (Admin) Mở cược
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/bet-markets/:id/close` — (Admin) Đóng cược
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/bet-markets` — (Admin) DS thị trường cược
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/bet-markets/:id/bets` — (Admin) DS cược của market
**Auth:** Bearer Token (role ADMIN)

---

## 13. Notifications — Thông báo

### GET `/notifications` — Thông báo của tôi
**Auth:** Bearer Token

---

### GET `/notifications/unread-count` — Số chưa đọc
**Auth:** Bearer Token

---

### PUT `/notifications/:id/read` — Đánh dấu đã đọc
**Auth:** Bearer Token

---

### PUT `/notifications/read-all` — Đánh dấu tất cả đã đọc
**Auth:** Bearer Token

---

### GET `/admin/notifications` — (Admin) Tất cả thông báo
**Auth:** Bearer Token (role ADMIN)

---

### POST `/admin/notification-campaigns` — (Admin) Tạo chiến dịch thông báo
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "title": "Thông báo giải đấu mới",
  "content": "Nội dung thông báo...",
  "targetRoles": ["USER", "JOCKEY"],
  "scheduledAt": "2025-08-01T10:00:00Z"
}
```

---

### GET `/admin/notification-campaigns` — (Admin) DS chiến dịch
**Auth:** Bearer Token (role ADMIN)

---

## 14. Finance Settings — Cài đặt tài chính

### GET `/admin/finance-settings` — Cài đặt phí
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/finance-settings` — Cập nhật cài đặt phí
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "platformFeePercent": 5,
  "bettingTaxPercent": 2,
  "withdrawalFee": 10000
}
```

---

### GET `/admin/finance-settings/race-prize-shares` — Cơ cấu giải thưởng
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/finance-settings/race-prize-shares` — Cập nhật giải thưởng
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
[
  { "position": 1, "percent": 50 },
  { "position": 2, "percent": 30 },
  { "position": 3, "percent": 20 }
]
```

---

### GET `/admin/payout-debts` — Nợ thanh toán
**Auth:** Bearer Token (role ADMIN)

---

### GET `/admin/audit-logs` — Nhật ký hoạt động
**Auth:** Bearer Token (role ADMIN)

---

## 15. System Settings — Cài đặt hệ thống

### GET `/system-settings/branding` — Thương hiệu (public)
**Auth:** Không cần

---

### GET `/admin/system-settings` — Tất cả cài đặt
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/system-settings/fees` — Cập nhật phí
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/system-settings/rules` — Cập nhật quy tắc
**Auth:** Bearer Token (role ADMIN)

---

### PUT `/admin/system-settings/branding` — Cập nhật thương hiệu
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "appName": "Horse Racing VN",
  "logoUrl": "https://example.com/logo.png",
  "primaryColor": "#0f766e"
}
```

---

### PUT `/admin/system-settings/race-distances` — Cập nhật cự ly đua
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
[1000, 1200, 1600, 2000, 2400]
```

---

## 16. Location — Địa điểm

### GET `/admin/provinces` — Danh sách tỉnh/thành
**Auth:** Bearer Token (role ADMIN)

---

### POST `/admin/provinces` — Thêm tỉnh/thành
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{ "name": "Hà Nội", "code": "HN" }
```

---

### GET `/admin/provinces/:provinceId/venues` — Địa điểm trong tỉnh
**Auth:** Bearer Token (role ADMIN)

---

### POST `/admin/provinces/:provinceId/venues` — Thêm địa điểm
**Auth:** Bearer Token (role ADMIN)

**Body (JSON):**
```json
{
  "name": "Trường đua Phú Thọ",
  "address": "123 Đường ABC, Quận 11",
  "capacity": 5000
}
```

---

### PUT `/admin/venues/:venueId` — Cập nhật địa điểm
**Auth:** Bearer Token (role ADMIN)

---

### DELETE `/admin/venues/:venueId` — Xóa địa điểm
**Auth:** Bearer Token (role ADMIN)

---

## 17. Dashboard — Bảng điều khiển

| Method | Endpoint | Role |
|--------|----------|------|
| GET | `/users/me/dashboard` | Any |
| GET | `/owner/dashboard` | OWNER |
| GET | `/owner/races` | OWNER |
| GET | `/owner/prizes` | OWNER |
| GET | `/jockey/dashboard` | JOCKEY |
| GET | `/jockey/races` | JOCKEY |
| GET | `/jockey/performance` | JOCKEY |
| GET | `/jockey/prizes` | JOCKEY |
| GET | `/referee/dashboard` | REFEREE |
| GET | `/referee/races` | REFEREE |
| GET | `/spectator/dashboard` | SPECTATOR |
| GET | `/admin/dashboard` | ADMIN |
| GET | `/admin/dashboard/summary` | ADMIN |
| GET | `/admin/dashboard/revenue` | ADMIN |
| GET | `/admin/dashboard/top-horses` | ADMIN |
| GET | `/admin/races` | ADMIN |

---

## 18. Health Check

### GET `/api-health` — Kiểm tra trạng thái server
**Auth:** Không cần

**Response:**
```json
{
  "success": true,
  "data": { "service": "BE Node.js compatibility API", "status": "UP" }
}
```

---

## Tổng hợp theo Role

| Role | Quyền hạn chính |
|------|----------------|
| `USER` | Đọc public content, cập nhật profile, đặt cược, nạp/rút tiền |
| `ADMIN` | Toàn quyền quản lý |
| `OWNER` | Quản lý ngựa, đăng ký đua, mời jockey |
| `JOCKEY` | Xem profile, nhận lời mời, tham gia đua |
| `REFEREE` | Quản lý ngày đua, check-in, chốt kết quả |
| `SPECTATOR` | Xem dashboard, theo dõi giải đấu |

---

## Ví dụ flow test cơ bản trên Postman

```
1. POST /auth/register      → tạo tài khoản
2. POST /auth/login         → lấy token (lưu vào {{token}})
3. GET  /auth/me            → xác nhận đăng nhập
4. GET  /tournaments        → xem giải đấu
5. GET  /news               → xem tin tức
6. GET  /api-health         → kiểm tra server
```

**Flow Admin:**
```
1. POST /auth/login (admin account)
2. GET  /admin/users
3. PUT  /admin/users/:id/role  →  {"role": "JOCKEY"}
4. POST /admin/tournaments
5. POST /admin/tournaments/:id/races
6. GET  /admin/dashboard/summary
```
