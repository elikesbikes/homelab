# Building a Static Website with Hugo + Cloudflare

> Based on: *"Building a static website in Markdown with Hugo"* by Christian  
> Framework: [Hugo](https://gohugo.io) | Theme: [Blowfish](https://blowfish.page) | Hosting: Cloudflare Pages

---

## Table of Contents

1. [Prerequisites & Background](#1-prerequisites--background)
2. [Install Hugo](#2-install-hugo)
3. [Create a New Hugo Site](#3-create-a-new-hugo-site)
4. [Understand the Directory Structure](#4-understand-the-directory-structure)
5. [Install the Blowfish Theme (via Git Submodule)](#5-install-the-blowfish-theme-via-git-submodule)
6. [Configure the Blowfish Theme](#6-configure-the-blowfish-theme)
7. [Configure Site Parameters](#7-configure-site-parameters)
8. [Start the Local Dev Server](#8-start-the-local-dev-server)
9. [Add Content](#9-add-content)
10. [Use Front Matter](#10-use-front-matter)
11. [Use Shortcodes (YouTube Embed, Buttons, etc.)](#11-use-shortcodes-youtube-embed-buttons-etc)
12. [Customize the Homepage](#12-customize-the-homepage)
13. [Add Thumbnails to Posts](#13-add-thumbnails-to-posts)
14. [Configure Navigation Menus](#14-configure-navigation-menus)
15. [Next Steps: Deploy to Cloudflare Pages](#15-next-steps-deploy-to-cloudflare-pages)

---

## 1. Prerequisites & Background

### Why Hugo over WordPress?

| Feature | WordPress (CMS) | Hugo (Static) |
|---|---|---|
| Requires a database | ✅ Yes | ❌ No |
| Server-side processing per request | ✅ Yes | ❌ No |
| Speed | Slow (without optimization) | ⚡ Instant |
| Maintenance overhead | High | Very Low |
| Privacy (no user data stored) | No | ✅ Yes |
| CI/CD friendly | Hard | ✅ Native |

Hugo generates **pure HTML/CSS/JS files at build time**. No database, no server-side processing — just fast, static files served directly to the browser.

### What you need before starting

- A terminal (macOS/Linux/WSL on Windows)
- [Homebrew](https://brew.sh) (macOS/Linux) — or your OS package manager
- [Git](https://git-scm.com) installed
- [VS Code](https://code.visualstudio.com) (recommended editor)
- Basic familiarity with Markdown ([markdownguide.org](https://www.markdownguide.org))

---

## 2. Install Hugo

Hugo comes in two editions. The **extended version** is required by most themes (including Blowfish) as it supports Sass/SCSS and other advanced features.

### macOS (Homebrew — installs extended automatically)

```bash
brew install hugo
```

### Linux (Debian/Ubuntu)

```bash
sudo apt install hugo
```

> ⚠️ The apt version may be outdated. For the latest extended version on Linux, download the binary directly from the [Hugo releases page](https://github.com/gohugoio/hugo/releases) and make sure to pick the `_extended` variant.

### Windows (Chocolatey)

```powershell
choco install hugo-extended
```

### Verify installation

```bash
hugo version
```

You should see output like: `hugo v0.x.x+extended ...`

---

## 3. Create a New Hugo Site

Navigate to the parent directory where you want your project to live, then run:

```bash
# Create a new Hugo site (replace "my-new-website" with your project name)
hugo new site my-new-website

# Move into the project directory
cd my-new-website

# Open in VS Code
code .
```

Hugo scaffolds the full project structure automatically.

---

## 4. Understand the Directory Structure

```
my-new-website/
├── assets/          # Images, CSS, JS, scripts
├── config/          # Main configuration files
│   └── _default/    # Default config directory
├── content/         # Your Markdown content files
├── layouts/         # HTML templates (override theme layouts here)
├── public/          # ⬅️ Generated output — upload THIS to your web server
├── resources/       # Hugo's build cache
├── static/          # Static files copied as-is to /public
├── themes/          # Your installed theme(s)
└── hugo.toml        # Main config file (we'll replace this)
```

> 📌 **Key rule:** The `public/` directory contains everything you need to host your website. This is what gets deployed to Cloudflare Pages.

---

## 5. Install the Blowfish Theme (via Git Submodule)

Using a **Git submodule** is the recommended approach. It keeps the theme linked to its upstream GitHub repo so you can update it with a single command.

### Step 1 — Initialize a Git repo in your project

```bash
git init
```

### Step 2 — Add Blowfish as a submodule

```bash
git submodule add -b main https://github.com/nunocoracao/blowfish.git themes/blowfish
```

This clones the Blowfish theme into `themes/blowfish/`.

### Step 3 — Delete the default config file

Hugo generates a `hugo.toml` in the root. Blowfish uses its own config structure, so remove it:

```bash
rm hugo.toml
```

### Step 4 — Copy Blowfish's example config files

```bash
# Create the config/_default directory
mkdir -p config/_default

# Copy the theme's example config files into it
cp themes/blowfish/config/_default/*.toml config/_default/
```

You should now have these files in `config/_default/`:

```
config/_default/
├── hugo.toml
├── languages.en.toml
├── menus.en.toml
└── params.toml
```

---

## 6. Configure the Blowfish Theme

### Step 1 — Set the theme in `config/_default/hugo.toml`

Open `config/_default/hugo.toml` and add/uncomment the theme line at the top:

```toml
theme = "blowfish"
baseURL = "https://yourdomain.com/"   # Replace with your actual domain
defaultContentLanguage = "en"
```

> ⚠️ The `theme = "blowfish"` line is **required** when installing via Git submodule (as opposed to Hugo modules).

---

## 7. Configure Site Parameters

### `config/_default/languages.en.toml` — Author info & bio

```toml
[author]
  name = "Your Name"
  image = "https://github.com/yourusername.png"  # or path to local image in /assets
  headline = "Your tagline or short bio"
  bio = "A longer description about you and your site."

  [author.links]
    youtube = "https://youtube.com/@yourchannel"
    github = "https://github.com/yourusername"
    twitter = "https://twitter.com/yourhandle"
```

### `config/_default/params.toml` — Appearance & layout

```toml
# Color theme — options: blowfish, congo, neon, ocean, fire, slate, etc.
colorScheme = "congo"

# Default appearance (light / dark / auto)
defaultAppearance = "dark"

# Show author card position (top / bottom)
showAuthor = true
showAuthorBottom = true   # Show at bottom instead of top

[homepage]
  layout = "profile"      # Options: profile, page, hero, card, background, custom
  showRecent = true       # Show latest posts on homepage
  recentLimit = 5         # Number of recent posts to display
```

---

## 8. Start the Local Dev Server

Hugo includes a built-in dev server with **live reload** — no separate web server needed.

```bash
hugo server --disableFastRender --noHTTPCache
```

| Flag | Purpose |
|---|---|
| `--disableFastRender` | Forces full rebuilds — ensures 100% accurate preview |
| `--noHTTPCache` | Prevents browser from caching old CSS/JS/images |

Then open your browser to: **[http://localhost:1313](http://localhost:1313)**

> ✅ Any time you save a file in VS Code, Hugo rebuilds the site in milliseconds and the browser auto-refreshes.

---

## 9. Add Content

Hugo organizes content in the `content/` directory. The folder structure **mirrors your website's URL structure**.

### Recommended structure

```
content/
├── _index.md           # Homepage content
├── about.md            # /about page
├── resources.md        # /resources page
└── videos/
    ├── _index.md       # /videos section page
    └── my-first-post/
        ├── index.md    # /videos/my-first-post
        └── featured.jpg
```

### Create your first post

```bash
# Option 1: Manually create the file
mkdir -p content/videos/my-first-post
touch content/videos/my-first-post/index.md
```

### Example Markdown content (`index.md`)

```markdown
---
title: "My First Hugo Video Post"
date: 2024-01-01
description: "A short description of this post."
tags: ["hugo", "tutorial"]
categories: ["videos"]
draft: false
---

## Introduction

Write your content here using **Markdown**.

- Bullet point one
- Bullet point two

### Code Block Example

```bash
echo "Hello from Hugo!"
```

> This is a blockquote.
```

> 📖 New to Markdown? See [markdownguide.org](https://www.markdownguide.org) for full syntax reference.

---

## 10. Use Front Matter

**Front matter** is a metadata block at the very top of every Markdown file, enclosed by `---`.

```markdown
---
title: "Page Title"
date: 2024-01-15
description: "SEO description for this page."
tags: ["tag1", "tag2"]
categories: ["tutorials"]
draft: false          # Set to true to hide from build output
layout: "simple"      # Override page layout (simple removes author header)
showAuthor: false     # Override per-page author display
---
```

### Layout options (Blowfish)

| Layout | Best for |
|---|---|
| `post` (default) | Blog posts, video writeups |
| `simple` | About, Resources, static pages |
| `page` | Custom standalone pages |

---

## 11. Use Shortcodes (YouTube Embed, Buttons, etc.)

Shortcodes are reusable snippets that add complex features to plain Markdown.

### Embed a YouTube video

```markdown
{{< youtube VIDEO_ID >}}
```

To find the `VIDEO_ID`, look at the YouTube URL:  
`https://www.youtube.com/watch?v=`**`dQw4w9WgXcQ`** ← this part

### Add a button

```markdown
{{< button href="https://example.com" target="_blank" >}}
Visit Link
{{< /button >}}
```

### Alert / callout box

```markdown
{{< alert icon="triangle-exclamation" cardColor="#e63946" >}}
**Warning!** This is an important note.
{{< /alert >}}
```

> 📚 Find all Blowfish shortcodes at: [blowfish.page/docs/shortcodes](https://blowfish.page/docs/shortcodes/)

---

## 12. Customize the Homepage

Edit `config/_default/params.toml` under the `[homepage]` section:

```toml
[homepage]
  layout = "profile"      # profile | page | hero | card | background
  showRecent = true
  recentLimit = 5
```

### Background image homepage

1. Set `layout = "background"` in `params.toml`
2. Add your banner image to `assets/` (e.g., `assets/cover.jpg`)
3. Reference it in `params.toml`:

```toml
[homepage]
  layout = "background"
  homepageImage = "cover.jpg"
```

---

## 13. Add Thumbnails to Posts

To display a thumbnail/cover image on post listings:

### Step 1 — Convert your post from a file to a directory

```
# Before (single file)
content/videos/my-post.md

# After (directory with bundle)
content/videos/my-post/
├── index.md        ← rename from my-post.md
└── featured.jpg    ← your thumbnail image
```

### Step 2 — Name the image `featured.jpg` (or `.png`)

Hugo + Blowfish will automatically detect and display it as the post thumbnail on listing pages.

---

## 14. Configure Navigation Menus

Edit `config/_default/menus.en.toml`:

```toml
# Main navigation bar
[[main]]
  name = "Videos"
  pageRef = "videos"
  weight = 10

[[main]]
  name = "Tutorials"
  pageRef = "videos/tutorials"
  parent = "Videos"
  weight = 11

[[main]]
  name = "Reviews"
  pageRef = "videos/reviews"
  parent = "Videos"
  weight = 12

[[main]]
  name = "About"
  pageRef = "about"
  weight = 20

[[main]]
  name = "Resources"
  pageRef = "resources"
  weight = 30

# Footer menu (for legal pages, etc.)
[[footer]]
  name = "Legal Notice"
  pageRef = "legal"
  weight = 10
```

---

## 15. Next Steps: Deploy to Cloudflare Pages

> ⚠️ Covered in Part 2 of the video series. Here's a quick overview to get you ready.

### Step 1 — Push your project to GitHub/GitLab

```bash
git add .
git commit -m "Initial Hugo site with Blowfish theme"
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

> ⚠️ Make sure submodules are committed properly — Cloudflare Pages needs them:
> ```bash
> git submodule update --init --recursive
> ```

### Step 2 — Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project**
2. Connect your GitHub/GitLab repo
3. Set build settings:

| Setting | Value |
|---|---|
| **Framework preset** | Hugo |
| **Build command** | `hugo --minify` |
| **Build output directory** | `public` |
| **Environment variable** | `HUGO_VERSION` = `0.x.x` (match your local version) |

4. Click **Save and Deploy** — Cloudflare automatically rebuilds on every `git push`

---

## Quick Reference Cheat Sheet

```bash
# Install Hugo (macOS)
brew install hugo

# Create new site
hugo new site my-site && cd my-site

# Add Blowfish theme
git init
git submodule add -b main https://github.com/nunocoracao/blowfish.git themes/blowfish

# Start dev server
hugo server --disableFastRender --noHTTPCache

# Build for production
hugo --minify
```

---

## Useful Links

| Resource | URL |
|---|---|
| Hugo Official Docs | https://gohugo.io/documentation/ |
| Hugo Themes Gallery | https://themes.gohugo.io |
| Blowfish Theme Docs | https://blowfish.page/docs/ |
| Blowfish GitHub | https://github.com/nunocoracao/blowfish |
| Markdown Guide | https://www.markdownguide.org |
| Cloudflare Pages Docs | https://developers.cloudflare.com/pages/ |

---

*Guide based on the YouTube video: "Building a static website in Markdown with Hugo" by Christian*
