<script setup lang="ts">
import {ref,onMounted,watch} from 'vue';
import type {EmotionValues} from '../domain/emotion';
import type {AtmosphereVisual} from '../domain/presentation';
import {drawPlasmaLandscape} from '../visuals/plasma-landscape';
const props=defineProps<{circleId:string;visual?:AtmosphereVisual;emotionValues?:EmotionValues}>();const canvas=ref<HTMLCanvasElement>();
function draw(){if(canvas.value)drawPlasmaLandscape(canvas.value,props.circleId,props.visual,props.emotionValues);}
onMounted(draw);watch(()=>[props.circleId,props.visual,props.emotionValues],draw,{deep:true});
</script>
<template><canvas ref="canvas" class="bmx-plasma-landscape" width="720" height="160" aria-hidden="true"></canvas></template>
