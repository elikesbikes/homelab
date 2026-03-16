# Hugo Installation

## Install Hugo Extended (Latest)

Hugo Extended is required for themes that use SCSS/Sass (e.g. Blowfish).

```bash
# Set the version you want
HUGO_VERSION=0.158.0

# Download the extended Linux binary
curl -LJO https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz

# Extract
tar -xf hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz

# Install to user PATH (no sudo needed)
mv hugo ~/.local/bin/hugo
chmod +x ~/.local/bin/hugo

# Clean up
rm hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz LICENSE README.md

# Verify
hugo version
```

## Install Go (Required for Hugo Modules)

Hugo uses Go modules to download themes (e.g. Blowfish). Go must be in PATH.

```bash
# Get latest version number
curl -s "https://go.dev/VERSION?m=text" | head -1   # e.g. go1.26.1

# Download and extract to ~/.local/
GO_VERSION=1.26.1
curl -LO https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz
tar -xf go${GO_VERSION}.linux-amd64.tar.gz -C ~/.local/
rm go${GO_VERSION}.linux-amd64.tar.gz

# Verify
~/.local/go/bin/go version
```

Then add Go to PATH in `~/.bashrc`:

```bash
export PATH="$HOME/.local/go/bin:$PATH"
```

Reload your shell:

```bash
source ~/.bashrc
```

## Notes

- Use **Extended** edition — required by the Blowfish theme for SCSS compilation
- `~/.local/bin` must be in your `$PATH` (it is by default on Ubuntu/omakub)
- Go is required when the theme is loaded via Go modules (`go.mod`) — not needed if theme is in `/themes` folder
- Releases: https://github.com/gohugoio/hugo/releases

## Site: elikesbikes.com

- Repo: `/home/ecloaiza/devops/github/elikesbikes.com`
- Theme: Blowfish (Go module)
- Deploy: Cloudflare Pages (`wrangler.toml`)
- Local build: `cd /home/ecloaiza/devops/github/elikesbikes.com && hugo server`
