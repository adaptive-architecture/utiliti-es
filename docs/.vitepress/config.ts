import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "@adapt-arch/utiliti-es",
  description: "ECMAScript common utilities library",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "Examples", link: "/markdown-examples" },
      { text: "API", link: "/api-docs/index.html", target: "_blank" },
    ],

    sidebar: [
      {
        text: "Examples",
        items: [
          { text: "Markdown Examples", link: "/markdown-examples" },
          { text: "Runtime API Examples", link: "/api-examples" },
        ],
      },
    ],

    logo: "/logo.png",

    socialLinks: [{ icon: "github", link: "https://github.com/adaptive-architecture/utiliti-es" }],
    search: {
      provider: "local",
    },
  },
});
