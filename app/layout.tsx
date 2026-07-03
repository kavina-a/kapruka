import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Sans, Noto_Sans_Sinhala, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

// Display / headings: geometric, premium — clean like Söhne but free.
const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// Body: more personality than Inter — technical-human, IBM's gift to open-source.
const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Sinhala companion for the bilingual toggle. Not preloaded — English-first.
const notoSinhala = Noto_Sans_Sinhala({
  variable: "--font-noto-sinhala",
  subsets: ["sinhala"],
  display: "swap",
  preload: false,
});

const notoTamil = Noto_Sans_Tamil({
  variable: "--font-noto-tamil",
  subsets: ["tamil"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "ChatRuka — your Kapruka gift concierge",
  description:
    "Tell ChatRuka who you're gifting and the occasion. The spirit of the Kapruka — Sri Lanka's wish-granting tree — finds the right gift, quotes delivery anywhere on the island, and takes you all the way to a real checkout.",
  metadataBase: new URL("https://chatruka.example.com"),
  openGraph: {
    title: "ChatRuka — your Kapruka gift concierge",
    description:
      "Conversational gifting for Sri Lanka. Discover, personalise, and send the perfect gift — all in one chat.",
    type: "website",
    images: [{ url: "/logo.png", alt: "ChatRuka" }],
  },
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#41236D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakartaSans.variable} ${ibmPlex.variable} ${notoSinhala.variable} ${notoTamil.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
