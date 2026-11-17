#!/usr/bin/env python3
"""Offline APK/DEX check for the SDK 58 Room/WorkManager constructor regression.

No device, SDK, signing credentials or network calls. This checks binary contents,
not successful process startup. Use --report-only for the known-bad baseline APK.
"""

import argparse
import hashlib
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

TARGETS = (
    "Landroidx/work/impl/WorkDatabase_Impl;",
    "Landroidx/work/OverwritingInputMerger;",
    "Landroidx/work/ArrayCreatingInputMerger;",
)


class Dex:
    def __init__(self, data):
        if len(data) < 112 or data[:4] != b"dex\n":
            raise ValueError("Invalid DEX header")
        self.data = data
        self.strings = {}

    def u32(self, offset):
        if offset < 0 or offset + 4 > len(self.data):
            raise ValueError("DEX offset outside file")
        return struct.unpack_from("<I", self.data, offset)[0]

    def leb(self, offset):
        value = 0
        for shift in range(0, 35, 7):
            if offset >= len(self.data):
                raise ValueError("Truncated DEX ULEB128")
            byte = self.data[offset]
            offset += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value, offset
        raise ValueError("Invalid DEX ULEB128")

    def table_item(self, size_field, offset_field, stride, index):
        if not 0 <= index < self.u32(size_field):
            raise ValueError("DEX table index outside table")
        offset = self.u32(offset_field) + stride * index
        if offset < 0 or offset + stride > len(self.data):
            raise ValueError("DEX table outside file")
        return offset

    def string(self, index):
        if index not in self.strings:
            entry = self.table_item(56, 60, 4, index)
            _, offset = self.leb(self.u32(entry))
            end = self.data.index(b"\0", offset)
            # The target descriptors and method names are ASCII, hence also MUTF-8.
            self.strings[index] = self.data[offset:end].decode("utf-8", errors="replace")
        return self.strings[index]

    def type_name(self, index):
        return self.string(self.u32(self.table_item(64, 68, 4, index)))

    def constructors(self, offset):
        if offset == 0:
            return []
        counts = []
        for _ in range(4):
            value, offset = self.leb(offset)
            counts.append(value)
        if sum(counts) > len(self.data):
            raise ValueError("Unreasonable DEX class-data counts")
        for _ in range(sum(counts[:2])):
            _, offset = self.leb(offset)
            _, offset = self.leb(offset)
        result = []
        for count in counts[2:]:
            method_index = 0
            for _ in range(count):
                delta, offset = self.leb(offset)
                method_index += delta
                access, offset = self.leb(offset)
                code, offset = self.leb(offset)
                entry = self.table_item(88, 92, 8, method_index)
                _, proto, name = struct.unpack_from("<HHI", self.data, entry)
                if self.string(name) != "<init>":
                    continue
                parameters = self.u32(self.table_item(72, 76, 12, proto) + 8)
                result.append({
                    "arguments": self.u32(parameters) if parameters else 0,
                    "public": bool(access & 1),
                    "hasCode": code != 0,
                })
        return result

    def inspect(self):
        found = {}
        for index in range(self.u32(96)):
            entry = self.table_item(96, 100, 32, index)
            name = self.type_name(self.u32(entry))
            if name in TARGETS:
                found[name] = self.constructors(self.u32(entry + 24))
        return found


def inspect_apk(path):
    classes = {}
    compilers = []
    versions = {}
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            name = entry.filename
            if entry.file_size > 256 * 1024 * 1024:
                raise ValueError("APK entry exceeds inspection bound")
            if name.startswith("META-INF/") and (
                name.endswith("app-metadata.properties")
                or (name.endswith(".version") and ("androidx.work" in name or "androidx.room" in name))
            ):
                versions[name] = archive.read(entry).decode().strip()
            if not re.fullmatch(r"classes\d*\.dex", name):
                continue
            data = archive.read(entry)
            for descriptor, constructors in Dex(data).inspect().items():
                if descriptor in classes:
                    raise ValueError("Duplicate target class in APK")
                classes[descriptor] = {"dex": name, "constructors": constructors}
            for marker in re.finditer(rb"~~R8(\{[^\0]*\})", data):
                compilers.append(json.loads(marker.group(1)))
    for descriptor in TARGETS:
        entry = classes.setdefault(descriptor, {"dex": None, "constructors": []})
        entry["publicNoArgConstructor"] = any(
            c["arguments"] == 0 and c["public"] and c["hasCode"]
            for c in entry["constructors"]
        )
    r8_full = any(c.get("r8-mode") == "full" and c.get("compilation-mode") == "release" for c in compilers)
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "apk": path.name,
        "sha256": digest.hexdigest(),
        "versions": versions,
        "r8": compilers,
        "r8FullRelease": r8_full,
        "classes": classes,
        "ok": r8_full and all(c["publicNoArgConstructor"] for c in classes.values()),
        "deviceLaunchTested": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--report-only", action="store_true")
    options = parser.parse_args()
    try:
        report = inspect_apk(options.apk)
    except (OSError, ValueError, struct.error, zipfile.BadZipFile) as error:
        print(f"APK inspection failed: {error}", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(report, indent=2))
    sys.exit(0 if report["ok"] or options.report_only else 1)
