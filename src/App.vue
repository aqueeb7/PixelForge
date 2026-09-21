<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import StatusBar from './components/StatusBar.vue'
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <div class="app-content">
      <router-view class="app-view" />
      <StatusBar />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--color-bg-base);
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.app-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>