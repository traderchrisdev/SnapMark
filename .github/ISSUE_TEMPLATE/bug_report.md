---
name: Bug report
about: Something in SnapMark doesn't work as described
labels: bug
---

**Device and firmware:** (e.g. Manta, Chauvet 3.xx.xx; see the device's Settings)

**SnapMark version:** (Settings → Apps → Plugins → SnapMark)

**What I did:** (which button, in which app or document)

**What happened:** (and any message shown)

**What I expected:**

**Log (optional):** if you use `adb`, run the command below while reproducing the problem and paste the output:

```
adb logcat -v time | grep -E 'SnapMark|AndroidRuntime'
```
