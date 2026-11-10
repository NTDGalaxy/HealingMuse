import { getLocale } from "next-intl/server";
export default async function Page() {
  const vi = (await getLocale()) === "vi";
  return (
    <div className="legal-page">
      <h1>{vi ? "Nguồn hình ảnh" : "Artwork credits"}</h1>
      <p>
        {vi
          ? "Ảnh bìa của mỗi bản thu được vẽ bằng mã nguồn của HealingMuse từ mã và màu của bản thu. Ứng dụng không dùng ảnh chụp hay hình ảnh của bên thứ ba."
          : "Each recording's cover is drawn by HealingMuse's own code from the recording's identifier and colour. The app uses no photographs or third-party images."}
      </p>
      <h2>{vi ? "Cảnh ánh sáng ba chiều" : "Three-dimensional light scenes"}</h2>
      <p>
        {vi
          ? "Mỗi trang có một cảnh ánh sáng ba chiều riêng, dựng từ mã nguồn gốc theo giấy phép MIT. Các hình tĩnh thay thế được kết xuất từ chính những cảnh này."
          : "Each page has its own three-dimensional light scene, built from original source code under the MIT licence. The still images are rendered from the same scenes."}
      </p>
      <p>
        {vi
          ? "Âm nhạc và các bản thu do con người sáng tác và biểu diễn. Giấy phép và nguồn của từng bản thu nằm trong phần chi tiết của bản thu đó."
          : "The music and recordings are composed and performed by people. Each recording's licence and source are in that recording's details."}
      </p>
    </div>
  );
}
