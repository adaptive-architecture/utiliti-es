import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: "/utiliti-es/",
  title: "@adapt-arch/utiliti-es",
  description: "ECMAScript common utilities library",
  head: [["link", { rel: "shortcut icon", href: "./favicon.ico" }]],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      // { text: "Home", link: "/" },
      { text: "Components", link: "/components" },
      { text: "API", link: "/api-docs/index.html", target: "_blank" },
    ],

    sidebar: [
      {
        text: "Components",
        items: [
          { text: "Logger", link: "/components/logger" },
          {
            text: "PubSub",
            link: "/components/pub-sub",
            items: [{ text: "Plugins", link: "/components/pub-sub/plugins" }],
          },
          { text: "Utils", link: "/components/utils" },
        ],
      },
    ],

    logo: "/logo.png",

    socialLinks: [{ icon: "github", link: "https://github.com/adaptive-architecture/utiliti-es" }],
    search: {
      provider: "local",
    },
    docFooter: {
      next: false,
      prev: false,
    },
  },
});
