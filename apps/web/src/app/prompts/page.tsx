'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get, post } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { formatCost } from '@/lib/utils';
import { FlaskConical, Play, Save, Plus, Clock, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

interface PromptResult {
  response: string; latency_ms: number; cost: number;
  input_tokens: number; output_tokens: number; status: string; error_msg?: string;
}

const MODELS = [
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6', provider: 'anthropic' },
  { label: 'Claude Opus 4.7',   value: 'claude-opus-4-7',   provider: 'anthropic' },
  { label: 'GPT-4o',            value: 'gpt-4o',            provider: 'openai' },
  { label: 'GPT-4o Mini',       value: 'gpt-4o-mini',       provider: 'openai' },
  { label: 'Llama 3.1 8B',      value: 'llama3.1:8b',       provider: 'ollama' },
  { label: 'Qwen 3.5 4B',       value: 'qwen3.5:4b',        provider: 'ollama' },
];

export default function PromptsPage() {
  const { workspace, privacyBlurNums } = useAppStore();
  const blur = privacyBlurNums ? 'blur-sm select-none' : '';
  const [prompt, setPrompt]     = useState('');
  const [model1, setModel1]     = useState(MODELS[0]);
  const [model2, setModel2]     = useState(MODELS[2]);
  const [compare, setCompare]   = useState(false);
  const [running, setRunning]   = useState(false);
  const [result1, setResult1]   = useState<PromptResult | null>(null);
  const [result2, setResult2]   = useState<PromptResult | null>(null);
  const [saveName, setSaveName] = useState('');

  const { data: saved, mutate } = useSWR(
    `/prompts?workspace=${workspace}`,
    (u: string) => get<{ id: string; name: string; content: string; run_count: number; avg_latency_ms: number }[]>(u)
  );

  const run = async () => {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    setRunning(true); setResult1(null); setResult2(null);
    try {
      const r1 = await post<PromptResult>('/prompts/run', {
        prompt, model: model1.value, provider: model1.provider, workspace_id: workspace,
      });
      setResult1(r1);
      if (compare) {
        const r2 = await post<PromptResult>('/prompts/run', {
          prompt, model: model2.value, provider: model2.provider, workspace_id: workspace,
        });
        setResult2(r2);
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const savePrompt = async () => {
    if (!saveName || !prompt) return;
    await post('/prompts', { name: saveName, content: prompt, workspace_id: workspace });
    toast.success('Prompt saved');
    setSaveName('');
    mutate();
  };

  const ResultPanel = ({ result, modelLabel }: { result: PromptResult; modelLabel: string }) => (
    <div className="bg-surface-3 border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white">{modelLabel}</span>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{result.latency_ms}ms</span>
          <span className={`flex items-center gap-1 text-accent-amber ${blur}`}><DollarSign className="w-3 h-3" />{formatCost(result.cost)}</span>
          <span>{result.input_tokens}→{result.output_tokens} tok</span>
        </div>
      </div>
      {result.status === 'error' ? (
        <p className="text-accent-red text-sm">{result.error_msg}</p>
      ) : (
        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{result.response}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-xl font-bold text-white">Prompt Lab</h1>
        <p className="text-sm text-slate-500">Test, compare, and save prompts across models</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Editor */}
        <div className="xl:col-span-3 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select value={model1.value} onChange={e => setModel1(MODELS.find(m => m.value === e.target.value) ?? MODELS[0])}
              className="bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none">
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} className="accent-brand" />
              Compare with:
            </label>
            {compare && (
              <select value={model2.value} onChange={e => setModel2(MODELS.find(m => m.value === e.target.value) ?? MODELS[2])}
                className="bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none">
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            )}
          </div>

          <textarea
            value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="Enter your prompt here…"
            className="w-full h-48 bg-surface-2 border border-white/5 rounded-xl p-4 text-sm text-slate-200
                       focus:outline-none focus:border-brand/40 resize-y font-mono leading-relaxed"
          />

          <div className="flex gap-3">
            <button onClick={run} disabled={running}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white font-medium text-sm
                         hover:bg-brand-dark disabled:opacity-50 transition-colors">
              <Play className="w-4 h-4" />
              {running ? 'Running…' : compare ? 'Run Both' : 'Run'}
            </button>
            <input value={saveName} onChange={e => setSaveName(e.target.value)}
              placeholder="Save as…"
              className="flex-1 bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-brand/40" />
            <button onClick={savePrompt} disabled={!saveName || !prompt}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-3 border border-white/5 text-slate-400
                         hover:text-white hover:border-white/10 disabled:opacity-40 text-sm transition-colors">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>

          {(result1 || result2) && (
            <div className={`grid gap-4 ${compare ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {result1 && <ResultPanel result={result1} modelLabel={model1.label} />}
              {result2 && <ResultPanel result={result2} modelLabel={model2.label} />}
            </div>
          )}
        </div>

        {/* Saved prompts */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-white">Saved Prompts</h2>
          </div>
          <div className="space-y-2">
            {saved?.map(p => (
              <button key={p.id} onClick={() => setPrompt(p.content)}
                className="w-full text-left p-2.5 rounded-lg bg-surface-3 hover:bg-surface-4 transition-colors">
                <p className="text-xs font-medium text-white truncate">{p.name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{p.run_count} runs</p>
              </button>
            ))}
            {!saved?.length && <p className="text-xs text-slate-600">No saved prompts yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
