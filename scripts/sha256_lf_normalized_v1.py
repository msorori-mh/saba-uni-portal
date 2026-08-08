#!/usr/bin/env python3
"""SHA256_LF_NORMALIZED_V1 — cross-platform canonical hash for text SQL evidence.

Contract:
  SHA256 over UTF-8 bytes after deterministic LF normalization:
    CRLF -> LF
    standalone CR -> LF

This is NOT platform-native physical-file SHA256 and does not depend on
core.autocrlf. The same logical text yields the same digest on Windows,
Linux, and CI checkouts regardless of checkout line endings.

Usage:
  python scripts/sha256_lf_normalized_v1.py <path> [--body]
  python scripts/sha256_lf_normalized_v1.py --self-test

  --body  hash from the first \"begin;\" through end of file (inclusive)
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


HASH_CONTRACT = "SHA256_LF_NORMALIZED_V1"


def normalize_lf(raw: bytes) -> bytes:
    """Normalize CRLF and standalone CR to LF. Leave lone LF unchanged."""
    return raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def sha256_lf_normalized(raw: bytes) -> str:
    return hashlib.sha256(normalize_lf(raw)).hexdigest()


def sha256_lf_file(path: Path) -> str:
    return sha256_lf_normalized(path.read_bytes())


def extract_body_from_begin(raw: bytes) -> bytes:
    """Return bytes from the first 'begin;' through EOF (after LF normalization)."""
    normalized = normalize_lf(raw)
    marker = b"begin;"
    idx = normalized.find(marker)
    if idx < 0:
        raise ValueError("no 'begin;' marker found")
    return normalized[idx:]


def sha256_lf_body(path: Path) -> str:
    return hashlib.sha256(extract_body_from_begin(path.read_bytes())).hexdigest()


def self_test() -> None:
    fixture = b"-- header\nbegin;\nselect 1;\n"
    lf = fixture
    crlf = fixture.replace(b"\n", b"\r\n")
    cr = fixture.replace(b"\n", b"\r")
    mixed = b"-- header\r\nbegin;\rselect 1;\n"
    h_lf = sha256_lf_normalized(lf)
    h_crlf = sha256_lf_normalized(crlf)
    h_cr = sha256_lf_normalized(cr)
    h_mixed = sha256_lf_normalized(mixed)
    assert h_lf == h_crlf == h_cr == h_mixed, (h_lf, h_crlf, h_cr, h_mixed)
    body_lf = hashlib.sha256(extract_body_from_begin(lf)).hexdigest()
    body_crlf = hashlib.sha256(extract_body_from_begin(crlf)).hexdigest()
    assert body_lf == body_crlf
    # Physical hashes must differ when endings differ (proves we are not using native).
    assert hashlib.sha256(lf).hexdigest() != hashlib.sha256(crlf).hexdigest()
    print(f"{HASH_CONTRACT} self-test PASS")
    print(f"fixture_full={h_lf}")
    print(f"fixture_body={body_lf}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=HASH_CONTRACT)
    parser.add_argument("path", nargs="?", type=Path, help="file to hash")
    parser.add_argument(
        "--body",
        action="store_true",
        help="hash from first begin; through EOF",
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0

    if args.path is None:
        parser.error("path is required unless --self-test")

    if args.body:
        digest = sha256_lf_body(args.path)
        kind = "BODY"
    else:
        digest = sha256_lf_file(args.path)
        kind = "FULL"

    print(f"HASH_CONTRACT={HASH_CONTRACT}")
    print(f"{kind}_SHA256_LF={digest}")
    print(f"PATH={args.path.as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
