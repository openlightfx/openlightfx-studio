<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	let {
		open,
		onclose
	}: {
		open: boolean;
		onclose: () => void;
	} = $props();

	let currentStep = $state(0);
	let direction = $state(1); // 1 = forward, -1 = backward

	const STORAGE_KEY = 'openlightfx-studio:onboarding-complete';

	const steps = [
		{
			title: 'Welcome to OpenLightFX Studio',
			description:
				'Create stunning ambient lighting tracks for your home theater. Sync colors and effects to your favorite movies and shows.',
			icon: '🎬',
			isWelcome: true
		},
		{
			title: 'Load a Video',
			description:
				'Start by loading a video file using the File menu or drag-and-drop. Studio supports MP4, MKV, WebM, and more. Your video stays local — nothing is uploaded.',
			icon: '📂'
		},
		{
			title: 'Create Channels',
			description:
				'Channels represent your physical lights. Choose from preset templates (stereo, surround, theater) or create custom channels. Each channel maps to a bulb position in your room.',
			icon: '💡'
		},
		{
			title: 'Add Keyframes',
			description:
				'Double-click the timeline or press K to add keyframes. Set colors, brightness, and transitions using the color picker. Keyframes define how your lights change over time.',
			icon: '🎨'
		},
		{
			title: 'Preview & Export',
			description:
				'Enable the lighting overlay to preview effects in real-time on the video. When you\'re done, export your .lightfx track to share on the OpenLightFX Marketplace.',
			icon: '✨'
		}
	];

	function nextStep() {
		if (currentStep < steps.length - 1) {
			direction = 1;
			currentStep++;
		} else {
			finish();
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			direction = -1;
			currentStep--;
		}
	}

	function skip() {
		finish();
	}

	function finish() {
		try {
			localStorage.setItem(STORAGE_KEY, 'true');
		} catch {
			// localStorage may be unavailable
		}
		onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') skip();
		if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
		if (e.key === 'ArrowLeft') prevStep();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		transition:fade={{ duration: 200 }}
	>
		<div class="absolute inset-0 bg-black/70" onclick={skip}></div>

		<!-- Dialog -->
		<div
			class="relative z-10 w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden"
			style="background: var(--surface);"
			role="dialog"
			aria-modal="true"
			aria-label="Welcome to OpenLightFX Studio"
		>
			<!-- Progress bar -->
			<div class="h-1 w-full" style="background: var(--surface2);">
				<div
					class="h-full transition-all duration-300 ease-out rounded-r"
					style="width: {((currentStep + 1) / steps.length) * 100}%; background: var(--accent);"
				></div>
			</div>

			<!-- Content -->
			<div class="p-8 min-h-[320px] flex flex-col items-center justify-center text-center">
				{#key currentStep}
					<div
						class="flex flex-col items-center gap-4"
						in:fly={{ x: direction * 60, duration: 300, delay: 100 }}
						out:fly={{ x: direction * -60, duration: 200 }}
					>
						<span class="text-5xl">{steps[currentStep].icon}</span>

						{#if steps[currentStep].isWelcome}
							<div class="flex items-center gap-2 mb-2">
								<div
									class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
									style="background: var(--accent);"
								>
									LFX
								</div>
								<h2
									class="text-2xl font-bold"
									style="color: var(--text);"
								>
									{steps[currentStep].title}
								</h2>
							</div>
						{:else}
							<h2
								class="text-xl font-semibold"
								style="color: var(--text);"
							>
								{steps[currentStep].title}
							</h2>
						{/if}

						<p
							class="text-sm leading-relaxed max-w-md"
							style="color: var(--text-muted);"
						>
							{steps[currentStep].description}
						</p>
					</div>
				{/key}
			</div>

			<!-- Footer -->
			<div
				class="flex items-center justify-between px-8 py-4 border-t"
				style="border-color: var(--surface2);"
			>
				<div class="flex items-center gap-2">
					<!-- Step dots -->
					{#each steps as _, i}
						<button
							class="w-2 h-2 rounded-full transition-all duration-200"
							style="background: {i === currentStep ? 'var(--accent)' : 'var(--surface2)'}; {i === currentStep ? 'transform: scale(1.3);' : ''}"
							onclick={() => { direction = i > currentStep ? 1 : -1; currentStep = i; }}
							aria-label="Go to step {i + 1}"
						></button>
					{/each}
				</div>

				<div class="flex items-center gap-3">
					<button
						class="text-sm px-3 py-1.5 rounded-lg transition-colors hover:brightness-125"
						style="color: var(--text-muted);"
						onclick={skip}
					>
						Skip
					</button>

					{#if currentStep > 0}
						<button
							class="text-sm px-3 py-1.5 rounded-lg transition-colors"
							style="color: var(--text); background: var(--surface2);"
							onclick={prevStep}
						>
							Back
						</button>
					{/if}

					<button
						class="text-sm px-4 py-1.5 rounded-lg font-medium transition-colors hover:brightness-110"
						style="background: var(--accent); color: white;"
						onclick={nextStep}
					>
						{currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
