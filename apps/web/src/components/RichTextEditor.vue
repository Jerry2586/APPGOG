<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { safeCmsHtml } from '../cms-client';
import MediaPicker from './MediaPicker.vue';
const props = defineProps<{ modelValue: string; disabled?: boolean; label?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const host = ref<HTMLElement>(), toolbar = ref<HTMLElement>(), picker = ref(false);
let editor: Quill | undefined, lastValue = '', imageIndex = 0;
function changed() { if (!editor) return; lastValue = editor.getText().trim() || editor.root.querySelector('img') ? editor.getSemanticHTML() : ''; emit('update:modelValue', lastValue); }
function chooseImage() { if (!editor || props.disabled) return; imageIndex = editor.getSelection()?.index ?? editor.getLength()-1; picker.value = true; }
function insertImage(url: string) { if (!editor || props.disabled) return; editor.insertEmbed(Math.min(imageIndex,editor.getLength()-1), 'image', url, 'user'); }
onMounted(() => {
  editor = new Quill(host.value!, { theme: 'snow', readOnly: props.disabled, modules: { toolbar: toolbar.value!, history: { userOnly: true } },
    formats: ['header','bold','italic','underline','strike','blockquote','code-block','list','link','image'] });
  editor.root.setAttribute('role','textbox'); editor.root.setAttribute('aria-multiline','true'); editor.root.setAttribute('aria-label',props.label || '富文本正文');
  editor.clipboard.dangerouslyPasteHTML(safeCmsHtml(props.modelValue,'RICH_TEXT'), 'silent'); lastValue = props.modelValue;
  editor.on('text-change',changed);
});
watch(()=>props.disabled, value=>editor?.enable(!value));
watch(()=>props.modelValue,value=>{ if (editor && value !== lastValue) { editor.clipboard.dangerouslyPasteHTML(safeCmsHtml(value,'RICH_TEXT'),'silent'); lastValue=value; editor.history.clear(); } });
onUnmounted(()=>{ editor?.off('text-change',changed); editor=undefined; });
</script>
<template><div class="cms-rich-editor"><div ref="toolbar" role="toolbar" aria-label="富文本工具栏">
  <select class="ql-header" aria-label="段落样式" :disabled="disabled"><option selected value="">正文</option><option value="1">标题一</option><option value="2">标题二</option><option value="3">标题三</option></select>
  <button type="button" class="ql-bold" aria-label="加粗" :disabled="disabled"></button><button type="button" class="ql-italic" aria-label="斜体" :disabled="disabled"></button><button type="button" class="ql-underline" aria-label="下划线" :disabled="disabled"></button><button type="button" class="ql-strike" aria-label="删除线" :disabled="disabled"></button>
  <button type="button" class="ql-list" value="ordered" aria-label="有序列表" :disabled="disabled"></button><button type="button" class="ql-list" value="bullet" aria-label="无序列表" :disabled="disabled"></button><button type="button" class="ql-blockquote" aria-label="引用" :disabled="disabled"></button><button type="button" class="ql-code-block" aria-label="代码块" :disabled="disabled"></button><button type="button" class="ql-link" aria-label="链接" :disabled="disabled"></button><button type="button" class="ql-clean" aria-label="清除格式" :disabled="disabled"></button>
  <button type="button" aria-label="撤销正文修改" :disabled="disabled" @click="editor?.history.undo()">↶</button><button type="button" aria-label="重做正文修改" :disabled="disabled" @click="editor?.history.redo()">↷</button>
</div><div ref="host"></div><button type="button" :disabled="disabled" @click="chooseImage">从媒体库插入正文图片</button><MediaPicker :visible="picker" @close="picker=false" @select="insertImage" /></div></template>
