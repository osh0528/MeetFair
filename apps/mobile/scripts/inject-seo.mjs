import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve(process.cwd(), process.argv[2] ?? "dist/index.html");
const siteUrl = "https://meet-fair-web.vercel.app/";
const title = "MeetFair | 공평한 약속 장소와 실시간 모임 관리";
const description = "친구들과 모임을 만들고 공평한 장소 추천, 투표, 실시간 위치 공유, 채팅과 영상통화를 한곳에서 이용하세요.";
const imageUrl = `${siteUrl}og-image.png`;
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "MeetFair",
  alternateName: "Meet Fair",
  url: siteUrl,
  description,
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Web, Android, iOS",
  inLanguage: "ko-KR",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
  },
};

const seoMarkup = `
    <meta name="description" content="${description}" />
    <meta name="keywords" content="모임, 약속 장소 추천, 중간 장소, 실시간 위치 공유, 장소 투표, 그룹 채팅, 영상통화, MeetFair" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="theme-color" content="#303030" />
    <meta name="application-name" content="MeetFair" />
    <meta name="apple-mobile-web-app-title" content="MeetFair" />
    <link rel="canonical" href="${siteUrl}" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="alternate" hreflang="ko-KR" href="${siteUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:site_name" content="MeetFair" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${siteUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="MeetFair - 모임 생성부터 만남까지 한 번에" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

let html = await readFile(outputPath, "utf8");
html = html.replace(/<html\s+lang="[^"]*">/, "<html lang=\"ko\">");
html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
html = html.replace("</head>", `${seoMarkup}\n  </head>`);
html = html.replace(
  /<noscript>[\s\S]*?<\/noscript>/,
  `<noscript>${description} MeetFair를 이용하려면 브라우저에서 JavaScript를 활성화해 주세요.</noscript>`,
);
await writeFile(outputPath, html, "utf8");
