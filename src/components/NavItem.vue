<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  name: string
  label: string
  icon: string
}>()

const route = useRoute()
const isActive = computed(() => route.name === props.name)
</script>

<template>
  <!-- Rendered as router-link by the parent (Sidebar) -->
  <slot :isActive="isActive" />
</template>
