"""Validate a local Play candidate without printing manifest values for SDK keys."""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["bootstrap", "internal"])
    parser.add_argument("signing", choices=["unsigned", "signed"])
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--version-code", type=int)
    args = parser.parse_args()
    jar = os.environ.get("DF_BUNDLETOOL_JAR")
    if not jar or not Path(jar).is_file():
        raise ValueError("Set DF_BUNDLETOOL_JAR to the local bundletool JAR.")

    bundletool = ["java", "-jar", jar]
    bundle_arg = f"--bundle={args.bundle}"
    subprocess.run([*bundletool, "validate", bundle_arg], check=True, capture_output=True)
    manifest = subprocess.run(
        [*bundletool, "dump", "manifest", bundle_arg, "--module=base"],
        check=True, capture_output=True,
    )
    root = ElementTree.fromstring(manifest.stdout)
    android = "{http://schemas.android.com/apk/res/android}"
    app, sdk = root.find("application"), root.find("uses-sdk")
    code = int(root.get(android + "versionCode", "0"))
    if root.get("package") != "tj.dushanbefresh.app" or code < 1:
        raise ValueError("Unexpected package or versionCode.")
    if args.version_code is not None and code != args.version_code:
        raise ValueError("Bundle versionCode differs from the requested versionCode.")
    if app is None or sdk is None or app.get(android + "debuggable") in ("true", "1"):
        raise ValueError("Expected an Android release manifest.")
    maps = any(item.get(android + "name") == "com.google.android.geo.API_KEY"
               and item.get(android + "value") for item in app.findall("meta-data"))
    if maps != (args.mode == "internal"):
        raise ValueError("Android Maps configuration does not match the selected build mode.")
    with ZipFile(args.bundle) as archive:
        signatures = [name for name in archive.namelist()
                      if re.fullmatch(r"META-INF/[^/]+\.(RSA|DSA|EC)", name, re.IGNORECASE)]
        if len(signatures) != (1 if args.signing == "signed" else 0):
            raise ValueError("Unexpected AAB signature state.")
        code_bundle = archive.read("base/assets/index.android.bundle")
        if b"https://dushanbefresh.tj/api/v1" not in code_bundle:
            raise ValueError("Expected the production API in the Android JS bundle.")
    print(json.dumps({"package": root.get("package"), "versionName": root.get(android + "versionName"),
                      "versionCode": code, "targetSdk": sdk.get(android + "targetSdkVersion"),
                      "mapsConfigured": maps, "signing": args.signing}))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit("bundletool failed. Raw output was suppressed because it can contain manifest values.")
    except (ElementTree.ParseError, KeyError, OSError):
        sys.exit("Unable to inspect the Android bundle.")
    except ValueError as error:
        sys.exit(str(error))
