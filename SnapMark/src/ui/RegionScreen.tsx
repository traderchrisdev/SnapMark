// "Choose a region": the screen as it was captured (or a document page), a box dragged over the part to
// keep. Shown as a plugin screen, so NOTE and DOC turn the pen's drawing off while it's up and pen strokes
// arrive here as touches.
// E-ink: a plain black outline with corner handles. While dragging, only the box view is updated
// (setNativeProps), not the whole screen; React catches up when the finger lifts.

import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Rect, Size } from '../core/backlink';
import {
  boxFrom,
  boxToCapturePx,
  clampPoint,
  containFrame,
  isBigEnough,
  MIN_BOX_DP,
  oppositeCorner,
  type Point,
} from '../core/region';
import { answerRegion, type RegionChoice, type RegionRequest } from '../features/region';
import { Button, INK, PAPER } from './components';

const CORNER_REACH_DP = 40;
const REDRAW_STEP_DP = 4;
const HANDLE_DP = 18;
const NO_BOX: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

function at(r: Rect) {
  return { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top };
}

/** The capture: rendered once per layout, not on every box move. */
const Picture = React.memo(function Picture({ uri, frame }: { uri: string; frame: Rect }) {
  return (
    <>
      <View pointerEvents="none" style={[s.abs, at(frame)]}>
        <Image source={{ uri }} style={s.fill} resizeMode="stretch" resizeMethod="resize" fadeDuration={0} />
      </View>
      <View pointerEvents="none" style={[s.abs, s.frameLine, at(frame)]} />
    </>
  );
});

export function RegionScreen({ request }: { request: RegionRequest }) {
  const { capture, wholeLabel } = request;
  const [frame, setFrame] = useState<Rect | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  // The responder callbacks are created once; they read the latest values through refs.
  const frameRef = useRef<Rect | null>(null);
  const boxRef = useRef<Rect | null>(null);
  const boxView = useRef<View>(null);
  const anchor = useRef<Point | null>(null);
  const lastDrawn = useRef<Point | null>(null);

  /** Move the box view directly; fall back to a React update if this runtime can't. */
  const draw = (r: Rect) => {
    boxRef.current = r;
    try {
      boxView.current?.setNativeProps({ style: { ...at(r), opacity: 1 } });
    } catch {
      setBox(r);
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const area: Size = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
    const f = containFrame(area, capture);
    frameRef.current = f;
    setFrame(f);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => {
          const f = frameRef.current;
          if (!f) {
            return;
          }
          const p = clampPoint({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, f);
          const current = boxRef.current;
          // Near a corner of the current box: adjust it. Anywhere else: start a new box.
          const opposite = current ? oppositeCorner(current, p, CORNER_REACH_DP) : null;
          anchor.current = opposite ?? p;
          lastDrawn.current = p;
          if (!opposite) {
            draw(boxFrom(p, p));
          }
        },
        onPanResponderMove: e => {
          const f = frameRef.current;
          if (!f || !anchor.current) {
            return;
          }
          const p = clampPoint({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, f);
          const last = lastDrawn.current;
          if (last && Math.abs(p.x - last.x) < REDRAW_STEP_DP && Math.abs(p.y - last.y) < REDRAW_STEP_DP) {
            return;
          }
          lastDrawn.current = p;
          draw(boxFrom(anchor.current, p));
        },
        onPanResponderRelease: () => {
          anchor.current = null;
          const current = boxRef.current;
          const keep = current && isBigEnough(current, MIN_BOX_DP) ? current : null;
          boxRef.current = keep;
          if (!keep) {
            // React may see no change (no box before, none now), so hide the slip directly too.
            try {
              boxView.current?.setNativeProps({ style: { opacity: 0 } });
            } catch {}
          }
          setBox(keep);
        },
      }),
    [],
  );

  const answer = (choice: RegionChoice) => {
    setBusy(true);
    answerRegion(choice);
  };

  const hint = busy
    ? 'Snapping…'
    : box
      ? 'Drag a corner to adjust it, or drag elsewhere to start over.'
      : 'Drag over the part you want to keep.';

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.hint}>{hint}</Text>
        <Button label="Cancel" onPress={() => answer(null)} disabled={busy} />
        <Button label={wholeLabel} onPress={() => answer('whole')} disabled={busy} />
        <Button
          label="Snap region"
          onPress={() => box && frame && answer(boxToCapturePx(box, frame, capture))}
          disabled={busy || !box}
        />
      </View>
      <View style={s.area} onLayout={onLayout} {...pan.panHandlers}>
        {/* Children ignore touches, so locationX/Y are always relative to the area. */}
        {frame ? <Picture uri={`file://${capture.path}`} frame={frame} /> : null}
        <View ref={boxView} pointerEvents="none" style={[s.abs, at(box ?? NO_BOX), box ? s.shown : s.hidden]}>
          <View style={[s.fill, s.boxLine]} />
          <View style={[s.handle, { left: -HANDLE_DP / 2, top: -HANDLE_DP / 2 }]} />
          <View style={[s.handle, { right: -HANDLE_DP / 2, top: -HANDLE_DP / 2 }]} />
          <View style={[s.handle, { left: -HANDLE_DP / 2, bottom: -HANDLE_DP / 2 }]} />
          <View style={[s.handle, { right: -HANDLE_DP / 2, bottom: -HANDLE_DP / 2 }]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: INK,
  },
  hint: { flex: 1, minWidth: 260, fontSize: 22, color: INK, marginRight: 12, marginBottom: 12 },
  area: { flex: 1, backgroundColor: PAPER },
  abs: { position: 'absolute' },
  fill: { width: '100%', height: '100%' },
  frameLine: { borderWidth: 1, borderColor: INK },
  boxLine: { borderWidth: 3, borderColor: INK },
  shown: { opacity: 1 },
  hidden: { opacity: 0 },
  handle: { position: 'absolute', width: HANDLE_DP, height: HANDLE_DP, backgroundColor: INK },
});
