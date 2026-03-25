<script lang="ts">
  import type { EffectType } from '$lib/types/track.js';
  import { getEffectRenderer, getEffectDefinition } from '$lib/effects/index.js';
  import { rgbToCssString } from '$lib/services/color-utils.js';

  let {
    effectType,
    width = 60,
    height = 24,
  }: {
    effectType: EffectType;
    width?: number;
    height?: number;
  } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let animationId = 0;
  let startTime = 0;
  let isVisible = $state(true);

  const def = $derived(getEffectDefinition(effectType));
  const renderer = $derived(getEffectRenderer(effectType));

  function buildDefaultParams(): Record<string, number> {
    const params: Record<string, number> = {};
    for (const p of def.params) {
      params[p.key] = p.default;
    }
    return params;
  }

  function animate(now: number) {
    if (!canvas || !isVisible) return;

    if (startTime === 0) startTime = now;
    const elapsed = now - startTime;
    const durationMs = def.defaultDurationMs;
    const timeOffset = elapsed % durationMs;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const params = buildDefaultParams();
    const sample = renderer.sample(
      timeOffset,
      durationMs,
      def.defaultIntensity,
      def.defaultPrimaryColor,
      def.defaultSecondaryColor,
      params
    );

    const brightness = sample.brightness / 100;
    const color = {
      r: Math.round(sample.color.r * brightness),
      g: Math.round(sample.color.g * brightness),
      b: Math.round(sample.color.b * brightness),
    };

    ctx.fillStyle = rgbToCssString(color);
    ctx.fillRect(0, 0, width, height);

    animationId = requestAnimationFrame(animate);
  }

  function startAnimation() {
    stopAnimation();
    startTime = 0;
    animationId = requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
    }
  }

  $effect(() => {
    if (!canvas) return;

    // Set up IntersectionObserver to pause when not visible
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      stopAnimation();
    };
  });

  $effect(() => {
    if (isVisible && canvas) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="rounded-sm"
  style="width: {width}px; height: {height}px;"
></canvas>
