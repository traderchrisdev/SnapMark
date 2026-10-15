# Third-party notices

## SuperDashboard

SnapMark's floating button (`SnapMark/android/app/src/main/java/com/snapmark/SnapMarkNativeModule.java`)
adapts the overlay technique from SuperDashboard (https://github.com/AgP42/SuperDashboard):
- a `TYPE_APPLICATION_OVERLAY` window shown from PluginHost;
- tap-versus-drag handling;
- finding orphaned bubbles through `WindowManagerGlobal`.

SuperDashboard is licensed under the MIT License:

```
MIT License

Copyright (c) 2026 AgP42

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Bundled in the plugin package

The `.snplg` package contains compiled code from these projects, under their own licenses:
- `sn-plugin-lib`: Supernote's plugin SDK (MIT, Copyright (c) 2025 xiaodong.xu);
- React and React Native (MIT, Copyright (c) Meta Platforms, Inc. and affiliates).
