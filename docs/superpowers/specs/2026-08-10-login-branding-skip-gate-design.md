# Login CRM: branding logo + bỏ cổng trung gian

## Mục tiêu

Trang `/login` gọn hơn, nhận diện thương hiệu Việt Mỹ rõ hơn; người đã có phiên Firebase vào thẳng CRM, không dừng ở màn «Bạn đang đăng nhập».

## UI — ô hero trái (`LoginView`)

Giữ:

- Eyebrow `VietMy Admissions`
- Tiêu đề `CRM tuyển sinh`

Xóa:

- Đoạn «Hồ sơ · gọi điện · KPI · thu phí…»
- Dòng chữ «Siêu quản trị điều hành nhiều trường · Admin setup…»

Thêm (kiểu **C**):

- Logo `LOGO VIETMY TRANG.png` căn giữa phần còn lại của ô (dưới tiêu đề, chiếm không gian chính của cell).
- Asset copy vào `public/brand/logo-vietmy-trang.png` (không khoảng trắng trong đường dẫn); `<img>` `object-contain`, kích thước lớn trên desktop, co vừa mobile; `alt` ngắn (vd. «Cao đẳng Việt Mỹ - Hà Nội»).

## UI — form phải

Giữ: email, mật khẩu, nút Đăng nhập CRM, link Cổng kế toán.

Xóa:

- Khối hướng dẫn Siêu quản trị (email bootstrap, mật khẩu mẫu, Đổi mật khẩu / Quản lý trường…).
- Dòng «Chỉ dành tài khoản có quyền kế toán…».

Placeholder email vẫn có thể dùng `defaultSuperAdminEmailFromEnv()` (không hiện khối hướng dẫn).

## Phiên đã đăng nhập

Khi `firebaseUser` + `status` là `authenticated` | `authenticating` trên `LoginView`:

- **Không** render `LoggedInPortalGate`.
- Redirect ngay bằng `<Navigate to={from} replace />` (`from` lấy từ `location.state`, mặc định `/`).

Ngoài phạm vi:

- Cổng kế toán (`AccountantLoginView`) vẫn dùng `LoggedInPortalGate` như hiện tại.
- Không đổi logic `signInWithEmail` / bootstrap Siêu quản trị.
- Không sửa `AuthSessionExitBar` trên các trang công khai khác.

## Kiểm thử thủ công

1. Chưa đăng nhập: `/login` hiện tiêu đề + logo giữa ô trái; form không còn 2 khối chữ đã xóa.
2. Đăng nhập thành công → vào CRM (không thấy màn trung gian).
3. Đã có phiên, mở lại `/login` → nhảy thẳng CRM (hoặc `from` nếu có).
4. Cổng `/ke-toan/login` khi đã đăng nhập: vẫn còn màn chọn vào / đăng xuất.
