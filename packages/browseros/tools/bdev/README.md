# bdev

BrowserOS Chromium patch workflow CLI.

## Install

Requires Go 1.24+.

```sh
cd tools/bdev
make install
```

This builds `bdev`, copies it into your Go bin directory, and codesigns it for local macOS execution.

## Development

```sh
make build
make test
make clean
```

Machine-local checkout/session state lives under `$XDG_CONFIG_HOME/bdev` or `~/.config/bdev`.

## Quick Start

```sh
bdev init --patches-repo /path/to/browseros
bdev apply --all --clean
bdev export --path chrome/browser/foo.cc
```

## Main Commands

- `bdev checkouts`
- `bdev status`
- `bdev sync`
- `bdev rebase`
- `bdev apply --all --clean`
- `bdev conflicts`
- `bdev resolve <path>`
- `bdev continue`
- `bdev export --path <file>`
- `bdev reset --to base|synced`
