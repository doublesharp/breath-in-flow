<template>
  <span
    class="session-status inline-flex max-w-full items-center justify-center gap-1.5 rounded-full border px-2.5 py-1.5 text-center text-xs font-semibold"
    :data-status="status"
  >
    <svg
      aria-hidden="true"
      class="size-[12px] shrink-0"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path :d="badge.iconPath" />
    </svg>
    {{ badge.label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionStatus } from '@breath-in-flow/shared';

const props = defineProps<{ status: SessionStatus }>();
const badges: Record<SessionStatus, { label: string; iconPath: string }> = {
  COMPLETED: { label: 'Completed', iconPath: 'm2 6 2.5 2.5L10 3' },
  CANCELLED: { label: 'Cancelled', iconPath: 'm3 3 6 6m0-6L3 9' },
  IN_PROGRESS: { label: 'In progress', iconPath: 'M6 6h.01' },
};
const badge = computed(() => badges[props.status]);
</script>
