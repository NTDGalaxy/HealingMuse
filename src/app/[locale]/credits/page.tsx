import credits from "../../../../content/artwork-credits.json";
import { getLocale } from "next-intl/server";
export default async function Page() {
  const vi = (await getLocale()) === "vi";
  return (
    <>
      <h1>{vi ? "Nguồn hình ảnh" : "Artwork credits"}</h1>
      <p>
        {vi
          ? "Ảnh được cắt, đổi kích thước và chuyển sang WebP. Giấy phép của ảnh gốc được giữ nguyên."
          : "Photographs are cropped, resized and converted to WebP. Original licences are retained."}
      </p>
      <ul className="credit-list">
        {credits.map((credit) => (
          <li key={credit.kind}>
            <a href={credit.provenanceUrl} rel="noopener noreferrer" target="_blank">
              {credit.title}
            </a>
            <p>
              {credit.artist} · <a href={credit.licenseUrl}>{credit.license}</a>
            </p>
          </li>
        ))}
      </ul>
      <h2>{vi ? "Những khu vườn tưởng tượng" : "Imagined botanical gardens"}</h2>
      <div className="reading-surface garden-credits">
        <p>
          {vi
            ? "Mười hai khu vườn được tạo riêng cho HealingMuse bằng các mô hình thực vật và kiến trúc nguyên bản. Mỗi khu vườn có ánh sáng ban ngày, ban đêm và một hình ảnh tĩnh tương ứng."
            : "Twelve gardens were created for HealingMuse using original botanical and architectural models. Each garden has day and night lighting and a matching still image."}
        </p>
        <p>
          {vi
            ? "Một hình ảnh ý tưởng được tạo bằng công cụ tạo ảnh trong quá trình thiết kế. Hình ảnh này chỉ dùng làm tham khảo, không được tải khi sử dụng ứng dụng. Các khu vườn không phải địa điểm có thật; âm nhạc và bản thu vẫn do con người sáng tạo."
            : "An image tool produced a development concept used only as a design reference. The application does not load that concept image. The gardens depict imagined places; music and recordings remain human-created."}
        </p>
        <p>
          {vi
            ? "Mô hình gốc và mã nguồn được cấp phép MIT. Hình ảnh tĩnh được kết xuất từ chính các khu vườn trong ứng dụng."
            : "Original models and source code are licensed under MIT. Still images are rendered from the application's own gardens."}
        </p>
      </div>
    </>
  );
}
