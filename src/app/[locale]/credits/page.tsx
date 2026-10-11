import credits from "../../../../content/artwork-credits.json";
import scenery from "../../../../content/scenery-credits.json";
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
      <h2>{vi ? "Phong cảnh trang trí" : "Decorative landscapes"}</h2>
      <p>
        {vi
          ? "Sáu phong cảnh được tạo bằng công cụ tạo ảnh trong quá trình thiết kế. Đây là phong cảnh tưởng tượng, không phải ảnh tư liệu về địa điểm có thật. Âm nhạc và bản thu vẫn do con người sáng tạo."
          : "Six landscapes were generated with an image tool during design. They depict imagined scenery rather than documented places. Music and recordings remain human-created."}
      </p>
      <ul className="credit-list">
        {scenery.map((credit) => (
          <li key={credit.id}>
            <strong>
              {vi
                ? credit.title
                : (
                    {
                      lake: "Dawn lake",
                      valley: "Mountain valley",
                      forest: "Misty forest",
                      coast: "Quiet coast",
                      pool: "Still pool",
                      hills: "Clouded hills",
                    } as Record<string, string>
                  )[credit.id]}
            </strong>
            <p>
              {vi
                ? "Tác phẩm trang trí được tạo trong quá trình thiết kế, chuyển sang WebP và AVIF."
                : "Decorative artwork produced during design, converted to WebP and AVIF."}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
