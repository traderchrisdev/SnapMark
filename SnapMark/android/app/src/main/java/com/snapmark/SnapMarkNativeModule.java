package com.snapmark;

import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

/**
 * SnapMark's native side: the floating capture button, screen capture, and bringing NOTE to the
 * front from any app (SPIKES.md §1l). PluginHost runs as the system uid (R58), so none of this
 * needs a permission prompt; keep this surface small.
 *
 * The overlay technique (TYPE_APPLICATION_OVERLAY from PluginHost; orphaned bubbles found through
 * WindowManagerGlobal) follows SuperDashboard (github.com/AgP42/SuperDashboard, MIT).
 */
public class SnapMarkNativeModule extends ReactContextBaseJavaModule {
    private static final String NAME = "SnapMarkNative";
    private static final String TAP_EVENT = "snapmarkBubbleTap";
    private static final String TAG = "SnapMark";
    private static final String BUBBLE_TAG = "SNAPMARK_BUBBLE";
    private static final String NOTE_PKG = "com.ratta.supernote.note";
    /** Time for the compositor to drop the bubble before the capture (150 ms keeps it out, R60). */
    private static final int HIDE_MS = 150;
    private static final Pattern RESUMED = Pattern.compile("mResumedActivity: ActivityRecord\\{\\S+ u\\d+ (\\S+)/(\\S+)");

    // One bubble per process. Taps go to the newest React context (a plugin reload makes a new one).
    private static ReactApplicationContext currentContext;
    private static WindowManager wm;
    private static View overlayView;
    private static WindowManager.LayoutParams overlayParams;
    private static int lastX = -1, lastY = -1;

    private final Handler main = new Handler(Looper.getMainLooper());
    private int startX, startY;
    private float startRawX, startRawY;
    private boolean dragging;

    public SnapMarkNativeModule(ReactApplicationContext context) {
        super(context);
        currentContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    // ---- Floating button ----------------------------------------------------------------------

    @ReactMethod
    public void showBubble(Promise promise) {
        main.post(() -> {
            try {
                Context ctx = getReactApplicationContext();
                if (!Settings.canDrawOverlays(ctx)) {
                    promise.reject("E_NO_OVERLAY", "PluginHost may not draw over other apps");
                    return;
                }
                removeOverlay();
                clearTaggedBubbles();
                wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);

                ImageView panel = new ImageView(ctx);
                panel.setTag(BUBBLE_TAG);
                panel.setImageBitmap(viewfinderIcon(dp(30)));
                panel.setScaleType(ImageView.ScaleType.CENTER);
                panel.setPadding(dp(8), dp(8), dp(8), dp(8));
                GradientDrawable bg = new GradientDrawable();
                bg.setColor(Color.WHITE);
                bg.setCornerRadius(dp(16));
                bg.setStroke(dp(2), Color.BLACK);
                panel.setBackground(bg);

                // TRANSLUCENT, not OPAQUE: e-ink compositors fill an opaque window's rounded corners black.
                overlayParams = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT);
                overlayParams.gravity = Gravity.TOP | Gravity.START;
                overlayParams.x = lastX >= 0 ? lastX : Math.max(0, screenW() - dp(90));
                overlayParams.y = lastY >= 0 ? lastY : dp(260);

                // Tap = capture, drag = move. No long-press: slow e-ink taps would trigger it.
                panel.setOnTouchListener((v, ev) -> {
                    switch (ev.getAction()) {
                        case MotionEvent.ACTION_DOWN:
                            startX = overlayParams.x;
                            startY = overlayParams.y;
                            startRawX = ev.getRawX();
                            startRawY = ev.getRawY();
                            dragging = false;
                            return true;
                        case MotionEvent.ACTION_MOVE: {
                            float dx = ev.getRawX() - startRawX, dy = ev.getRawY() - startRawY;
                            if (!dragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) dragging = true;
                            if (dragging) {
                                overlayParams.x = clamp(startX + (int) dx, 0, Math.max(0, screenW() - v.getWidth()));
                                overlayParams.y = clamp(startY + (int) dy, 0, Math.max(0, screenH() - v.getHeight()));
                                lastX = overlayParams.x;
                                lastY = overlayParams.y;
                                try { wm.updateViewLayout(overlayView, overlayParams); } catch (Exception ignored) {}
                            }
                            return true;
                        }
                        case MotionEvent.ACTION_UP:
                            if (!dragging) onTap();
                            return true;
                        default:
                            return false;
                    }
                });

                overlayView = panel;
                wm.addView(overlayView, overlayParams);
                promise.resolve(true);
            } catch (Exception e) {
                promise.reject("E_SHOW_BUBBLE", e.toString(), e);
            }
        });
    }

    @ReactMethod
    public void hideBubble(Promise promise) {
        main.post(() -> {
            removeOverlay();
            promise.resolve(true);
        });
    }

    /** Remove every SnapMark bubble in this process, including orphans from a previous plugin version. */
    @ReactMethod
    public void clearAllBubbles(Promise promise) {
        main.post(() -> promise.resolve(clearTaggedBubbles()));
    }

    private void onTap() {
        ReactApplicationContext ctx = currentContext;
        if (ctx == null || !ctx.hasActiveReactInstance()) {
            // The plugin is gone (disabled or uninstalled): the bubble has nobody to talk to.
            Log.i(TAG, "bubble tap without a live plugin: removing the bubble");
            removeOverlay();
            return;
        }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(TAP_EVENT, Arguments.createMap());
    }

    private void removeOverlay() {
        if (overlayView != null && wm != null) {
            try { wm.removeView(overlayView); } catch (Exception ignored) {}
        }
        overlayView = null;
    }

    @SuppressWarnings("unchecked")
    private int clearTaggedBubbles() {
        int removed = 0;
        try {
            Class<?> wmg = Class.forName("android.view.WindowManagerGlobal");
            Object inst = wmg.getMethod("getInstance").invoke(null);
            java.lang.reflect.Field f = wmg.getDeclaredField("mViews");
            f.setAccessible(true);
            List<View> views = (List<View>) f.get(inst);
            WindowManager w = (WindowManager) getReactApplicationContext().getSystemService(Context.WINDOW_SERVICE);
            for (View v : new ArrayList<>(views)) {
                if (v != null && BUBBLE_TAG.equals(v.getTag())) {
                    try { w.removeViewImmediate(v); removed++; } catch (Exception ignored) {}
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "clearTaggedBubbles: " + t);
        }
        if (removed > 0) overlayView = null;
        return removed;
    }

    /** Take the bubble off screen (true) or put it back (false), waiting for the main thread. */
    private void setBubbleHidden(boolean hidden) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        main.post(() -> {
            try {
                if (overlayView != null && wm != null) {
                    if (hidden) {
                        wm.removeViewImmediate(overlayView);
                    } else if (overlayView.getParent() == null) {
                        wm.addView(overlayView, overlayParams);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "setBubbleHidden(" + hidden + "): " + e);
            } finally {
                done.countDown();
            }
        });
        done.await(2, TimeUnit.SECONDS);
    }

    // ---- Screen capture ------------------------------------------------------------------------

    /**
     * Capture the screen (without the bubble), shrink it into the part of the page that NOTE's
     * toolbars leave free (insets in dp), and write an 8-bit gray PNG to outPath.
     */
    @ReactMethod
    public void captureScreen(String outPath, ReadableMap insetsDp, Promise promise) {
        new Thread(() -> {
            boolean hidden = false;
            try {
                long t0 = SystemClock.uptimeMillis();
                if (overlayView != null) {
                    setBubbleHidden(true);
                    hidden = true;
                    Thread.sleep(HIDE_MS);
                }
                long s0 = SystemClock.uptimeMillis();
                Bitmap shot = screenshot();
                long shotMs = SystemClock.uptimeMillis() - s0;
                if (hidden) {
                    setBubbleHidden(false);
                    hidden = false;
                }
                Bitmap soft = shot.getConfig() == Bitmap.Config.HARDWARE ? shot.copy(Bitmap.Config.ARGB_8888, false) : shot;
                if (soft != shot) shot.recycle();
                WritableMap m = fitAndWrite(soft, new File(outPath), insetsDp);
                m.putDouble("shotMs", shotMs);
                m.putDouble("totalMs", SystemClock.uptimeMillis() - t0);
                promise.resolve(m);
            } catch (Throwable e) {
                Log.e(TAG, "captureScreen failed", e);
                promise.reject("E_CAPTURE", e.toString(), e);
            } finally {
                if (hidden) {
                    try { setBubbleHidden(false); } catch (InterruptedException ignored) {}
                }
            }
        }).start();
    }

    /** The same shrink-and-write for an existing image (native screenshots in "Annotate screenshot"). */
    @ReactMethod
    public void fitImage(String srcPath, String outPath, ReadableMap insetsDp, Promise promise) {
        new Thread(() -> {
            try {
                long t0 = SystemClock.uptimeMillis();
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inPreferredConfig = Bitmap.Config.ARGB_8888;
                o.inMutable = false;
                Bitmap src = BitmapFactory.decodeFile(srcPath, o);
                if (src == null) throw new IOException("cannot decode " + srcPath);
                WritableMap m = fitAndWrite(src, new File(outPath), insetsDp);
                m.putDouble("totalMs", SystemClock.uptimeMillis() - t0);
                promise.resolve(m);
            } catch (Throwable e) {
                Log.e(TAG, "fitImage failed", e);
                promise.reject("E_FIT_IMAGE", e.toString(), e);
            }
        }).start();
    }

    /** Recycles src. */
    private WritableMap fitAndWrite(Bitmap src, File out, ReadableMap insetsDp) throws IOException {
        long k0 = SystemClock.uptimeMillis();
        int w = src.getWidth(), h = src.getHeight();
        int l = dp(insetsDp.getInt("left")), t = dp(insetsDp.getInt("top"));
        int r = dp(insetsDp.getInt("right")), b = dp(insetsDp.getInt("bottom"));
        float scale = Math.min((w - l - r) / (float) w, (h - t - b) / (float) h);
        Bitmap page = src;
        if (scale < 1f || l > 0 || t > 0) {
            page = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(page);
            cv.drawColor(Color.WHITE);
            cv.drawBitmap(src, null, new RectF(l, t, l + w * scale, t + h * scale),
                    new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG));
            src.recycle();
        }
        long composeMs = SystemClock.uptimeMillis() - k0;
        long e0 = SystemClock.uptimeMillis();
        File parent = out.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        writeGrayPng(page, out);
        page.recycle();
        WritableMap m = Arguments.createMap();
        m.putInt("width", w);
        m.putInt("height", h);
        m.putDouble("scale", scale);
        m.putDouble("composeMs", composeMs);
        m.putDouble("encodeMs", SystemClock.uptimeMillis() - e0);
        return m;
    }

    /** Android 10/11: SurfaceControl.screenshot(crop, w, h, rotation), as SystemUI does; 12+: captureDisplay. */
    private Bitmap screenshot() throws Exception {
        Class<?> sc = Class.forName("android.view.SurfaceControl");
        Display display = ((WindowManager) getReactApplicationContext().getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay();
        DisplayMetrics real = new DisplayMetrics();
        display.getRealMetrics(real);
        Bitmap b;
        try {
            Method shot = sc.getMethod("screenshot", Rect.class, int.class, int.class, int.class);
            b = (Bitmap) shot.invoke(null, new Rect(0, 0, real.widthPixels, real.heightPixels),
                    real.widthPixels, real.heightPixels, display.getRotation());
        } catch (NoSuchMethodException e) {
            Object token = sc.getMethod("getInternalDisplayToken").invoke(null);
            Class<?> argsClass = Class.forName("android.view.SurfaceControl$DisplayCaptureArgs");
            Class<?> builderClass = Class.forName("android.view.SurfaceControl$DisplayCaptureArgs$Builder");
            Object builder = builderClass.getConstructor(IBinder.class).newInstance(token);
            Object args = builderClass.getMethod("build").invoke(builder);
            Object buffer = sc.getMethod("captureDisplay", argsClass).invoke(null, args);
            b = buffer == null ? null : (Bitmap) buffer.getClass().getMethod("asBitmap").invoke(buffer);
        }
        if (b == null) throw new IllegalStateException("screenshot returned nothing");
        return b;
    }

    /**
     * 8-bit grayscale PNG, no row filters, fastest deflate: ~0.35 s for a 1920x2560 screen, against
     * ~1.4 s for Bitmap.compress of the ARGB bitmap (R61). E-ink is gray anyway; NOTE accepts it.
     */
    private static void writeGrayPng(Bitmap b, File out) throws IOException {
        int w = b.getWidth(), h = b.getHeight();
        int[] row = new int[w];
        byte[] line = new byte[w + 1];
        Deflater def = new Deflater(Deflater.BEST_SPEED);
        ByteArrayOutputStream idat = new ByteArrayOutputStream(w * h / 4);
        try (DeflaterOutputStream dos = new DeflaterOutputStream(idat, def, 64 * 1024)) {
            for (int y = 0; y < h; y++) {
                b.getPixels(row, 0, w, 0, y, w, 1);
                line[0] = 0; // filter type None
                for (int x = 0; x < w; x++) {
                    int c = row[x];
                    line[x + 1] = (byte) ((((c >> 16) & 0xff) * 77 + ((c >> 8) & 0xff) * 150 + (c & 0xff) * 29) >> 8);
                }
                dos.write(line);
            }
        } finally {
            def.end();
        }
        try (DataOutputStream os = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(out), 64 * 1024))) {
            os.write(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'});
            ByteBuffer ihdr = ByteBuffer.allocate(13);
            ihdr.putInt(w).putInt(h).put((byte) 8).put((byte) 0).put((byte) 0).put((byte) 0).put((byte) 0);
            pngChunk(os, "IHDR", ihdr.array());
            pngChunk(os, "IDAT", idat.toByteArray());
            pngChunk(os, "IEND", new byte[0]);
        }
    }

    private static void pngChunk(DataOutputStream os, String type, byte[] data) throws IOException {
        byte[] t = type.getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(t);
        crc.update(data);
        os.writeInt(data.length);
        os.write(t);
        os.write(data);
        os.writeInt((int) crc.getValue());
    }

    // ---- Apps in front -------------------------------------------------------------------------

    /** The app in front: {pkg, activity, taskId}. taskId is -1 if only dumpsys could tell. */
    @ReactMethod
    public void foreground(Promise promise) {
        new Thread(() -> {
            WritableMap m = Arguments.createMap();
            ActivityManager.RunningTaskInfo top = topTask();
            if (top != null && top.topActivity != null) {
                m.putString("pkg", top.topActivity.getPackageName());
                m.putString("activity", top.topActivity.getClassName());
                m.putInt("taskId", top.id);
            } else {
                String[] resumed = dumpsysResumed();
                m.putString("pkg", resumed == null ? "" : resumed[0]);
                m.putString("activity", resumed == null ? "" : resumed[1]);
                m.putInt("taskId", -1);
            }
            promise.resolve(m);
        }).start();
    }

    /** Bring NOTE's running task to the front, with whatever note it had open. False if NOTE has none. */
    @ReactMethod
    public void bringNoteToFront(Promise promise) {
        try {
            for (ActivityManager.RunningTaskInfo t : activityManager().getRunningTasks(50)) {
                if (t.baseActivity != null && NOTE_PKG.equals(t.baseActivity.getPackageName())) {
                    activityManager().moveTaskToFront(t.id, 0);
                    promise.resolve(true);
                    return;
                }
            }
            promise.resolve(false);
        } catch (Exception e) {
            promise.reject("E_NOTE_TO_FRONT", e.toString(), e);
        }
    }

    /** Back to the app the user was in (after a snap with "Stay here"). */
    @ReactMethod
    public void moveTaskToFront(int taskId, Promise promise) {
        try {
            activityManager().moveTaskToFront(taskId, 0);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_TASK_TO_FRONT", e.toString(), e);
        }
    }

    /** Open the first of `paths` that exists in NOTE (when NOTE has no task to bring back). Resolves it, or null. */
    @ReactMethod
    public void openFirstNote(ReadableArray paths, Promise promise) {
        try {
            for (int i = 0; i < paths.size(); i++) {
                String path = paths.getString(i);
                if (path == null || !new File(path).isFile()) continue;
                Intent intent = new Intent(Intent.ACTION_VIEW); // without ACTION_VIEW the file_path extra is ignored
                intent.setComponent(new ComponentName(NOTE_PKG, NOTE_PKG + ".view.NoteInsidePagesActivity"));
                intent.putExtra("file_path", path);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
                promise.resolve(path);
                return;
            }
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("E_OPEN_NOTE", e.toString(), e);
        }
    }

    /** Poll until `pkg` is in front. Resolves the ms waited, or -1 on timeout. */
    @ReactMethod
    public void waitForForeground(String pkg, int timeoutMs, Promise promise) {
        new Thread(() -> {
            long t0 = SystemClock.uptimeMillis();
            while (SystemClock.uptimeMillis() - t0 < timeoutMs) {
                ActivityManager.RunningTaskInfo top = topTask();
                String front = top != null && top.topActivity != null ? top.topActivity.getPackageName() : null;
                if (front == null) {
                    String[] resumed = dumpsysResumed();
                    front = resumed == null ? null : resumed[0];
                }
                if (pkg.equals(front)) {
                    promise.resolve((double) (SystemClock.uptimeMillis() - t0));
                    return;
                }
                SystemClock.sleep(50);
            }
            promise.resolve(-1.0);
        }).start();
    }

    /** Resolve after ms. JS timers stall while another app is in front (R34); native ones don't. */
    @ReactMethod
    public void sleep(int ms, Promise promise) {
        main.postDelayed(() -> promise.resolve(true), ms);
    }

    private ActivityManager activityManager() {
        return (ActivityManager) getReactApplicationContext().getSystemService(Context.ACTIVITY_SERVICE);
    }

    /** getRunningTasks sees every app from PluginHost (system uid, R63). */
    private ActivityManager.RunningTaskInfo topTask() {
        try {
            List<ActivityManager.RunningTaskInfo> tasks = activityManager().getRunningTasks(1);
            return tasks.isEmpty() ? null : tasks.get(0);
        } catch (Exception e) {
            Log.w(TAG, "getRunningTasks: " + e);
            return null;
        }
    }

    /** Fallback: SuperDashboard's way, ~50 ms. {package, activity} or null. */
    private static String[] dumpsysResumed() {
        Process p = null;
        try {
            p = new ProcessBuilder("dumpsys", "activity", "activities").start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null) {
                    Matcher mt = RESUMED.matcher(line);
                    if (mt.find()) return new String[]{mt.group(1), mt.group(2)};
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        } finally {
            if (p != null) p.destroy();
        }
    }

    // ---- Helpers ---------------------------------------------------------------------------------

    private int screenW() {
        return getReactApplicationContext().getResources().getDisplayMetrics().widthPixels;
    }

    private int screenH() {
        return getReactApplicationContext().getResources().getDisplayMetrics().heightPixels;
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private int dp(int v) {
        return Math.round(v * getReactApplicationContext().getResources().getDisplayMetrics().density);
    }

    /** Viewfinder corners around a dot: "capture the screen". Drawn in code (resources load unreliably in PluginHost). */
    private static Bitmap viewfinderIcon(int size) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.BLACK);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(size / 12f);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        float a = size * 0.1f, b = size * 0.9f, arm = size * 0.28f;
        float[][] corners = {{a, a, 1, 1}, {b, a, -1, 1}, {a, b, 1, -1}, {b, b, -1, -1}};
        for (float[] c : corners) {
            Path path = new Path();
            path.moveTo(c[0], c[1] + c[3] * arm);
            path.lineTo(c[0], c[1]);
            path.lineTo(c[0] + c[2] * arm, c[1]);
            cv.drawPath(path, p);
        }
        p.setStyle(Paint.Style.FILL);
        cv.drawCircle(size / 2f, size / 2f, size * 0.12f, p);
        return bmp;
    }
}
