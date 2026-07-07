"use client";

import { useState } from "react";
import { ExternalLink, MessageSquare, HelpCircle, Vote, FileText } from "lucide-react";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "./ui/PanelSkeleton";
import { formatGbDate } from "@/lib/format";

type Tab = "speeches" | "questions";

interface Speech {
  title: string;
  date: string;
  excerpt: string;
  url: string;
  house: string;
  type: string;
  speaker: string | null;
}

interface Question {
  title: string;
  date: string;
  excerpt: string;
  url: string;
  house: string;
  type: string;
  answeringBody: string | null;
  isAnswered: boolean;
}

interface SpeechesResponse {
  speeches?: Speech[];
}
interface QuestionsResponse {
  questions?: Question[];
}

export default function HansardFeed() {
  const [tab, setTab] = useState<Tab>("speeches");

  const speechesQ = useConstituencyResource<SpeechesResponse>(
    "/api/hansard?type=speeches"
  );
  const questionsQ = useConstituencyResource<QuestionsResponse>(
    "/api/hansard?type=questions",
    { skip: tab !== "questions" }
  );

  const loading = tab === "speeches" ? speechesQ.loading : questionsQ.loading;
  const speeches = speechesQ.data?.speeches ?? [];
  const questions = questionsQ.data?.questions ?? [];

  if (loading) return <PanelSkeleton variant="list" rows={5} />;

  return (
    <div data-component="hansardContainer">
      <div data-component="hansardTabs" className="flex border-b border-zinc-800">
        <TabButton active={tab === "speeches"} onClick={() => setTab("speeches")} icon={MessageSquare}>
          Recent Activity
        </TabButton>
        <TabButton active={tab === "questions"} onClick={() => setTab("questions")} icon={HelpCircle}>
          Written Questions
        </TabButton>
      </div>

      {tab === "speeches" && (
        <div className="divide-y divide-zinc-800/50">
          {speeches.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">
              No recent Hansard contributions found
            </div>
          ) : (
            speeches.slice(0, 10).map((speech, i) => (
              <SpeechRow key={i} speech={speech} />
            ))
          )}
        </div>
      )}

      {tab === "questions" && (
        <div className="divide-y divide-zinc-800/50">
          {questions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">
              No written questions found
            </div>
          ) : (
            questions.map((q, i) => <QuestionRow key={i} question={q} />)
          )}
        </div>
      )}

      <div className="px-3 py-2 border-t border-zinc-800/50 text-center">
        <a
          href="https://www.theyworkforyou.com/mp/11816/james_cleverly/braintree"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.556rem] text-zinc-600 hover:text-emerald-400 transition-colors"
        >
          View full record on TheyWorkForYou ↗
        </a>
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  children: React.ReactNode;
}

function TabButton({ active, onClick, icon: Icon, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "text-emerald-400 border-b-2 border-emerald-400"
          : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <Icon className="inline h-3 w-3 mr-1" />
      {children}
    </button>
  );
}

function SpeechRow({ speech }: { speech: Speech }) {
  const isDivision = speech.type === "division";
  return (
    <a
      data-component="hansardSpeechRow"
      href={speech.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-3 py-2.5 hover:bg-zinc-800/20 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 p-1 rounded ${isDivision ? "bg-blue-400/10" : "bg-amber-400/10"}`}>
          {isDivision ? (
            <Vote className="h-3 w-3 text-blue-400" />
          ) : (
            <FileText className="h-3 w-3 text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[0.667rem] text-zinc-300 leading-snug font-medium group-hover:text-zinc-100">
            {speech.title}
            <ExternalLink className="inline h-2.5 w-2.5 ml-1 text-zinc-600 group-hover:text-zinc-400" />
          </p>
          {speech.excerpt && (
            <p className="text-[0.611rem] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
              {speech.excerpt}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[0.556rem]">
            <span className="text-blue-400/70">{speech.house}</span>
            {speech.speaker && <span className="text-zinc-600">{speech.speaker}</span>}
            {speech.date && <span className="text-zinc-600">{formatGbDate(speech.date)}</span>}
          </div>
        </div>
      </div>
    </a>
  );
}

function QuestionRow({ question }: { question: Question }) {
  return (
    <a
      data-component="hansardQuestionRow"
      href={question.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-3 py-2.5 hover:bg-zinc-800/20 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 p-1 rounded bg-purple-400/10">
          <HelpCircle className="h-3 w-3 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[0.667rem] text-zinc-300 leading-snug font-medium group-hover:text-zinc-100">
            {question.title}
            <ExternalLink className="inline h-2.5 w-2.5 ml-1 text-zinc-600 group-hover:text-zinc-400" />
          </p>
          {question.excerpt && (
            <p className="text-[0.611rem] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
              {question.excerpt}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[0.556rem]">
            <span
              className={`px-1 rounded font-bold ${
                question.isAnswered
                  ? "text-emerald-400 bg-emerald-400/10"
                  : "text-amber-400 bg-amber-400/10"
              }`}
            >
              {question.isAnswered ? "Answered" : "Pending"}
            </span>
            {question.answeringBody && (
              <span className="text-zinc-600">{question.answeringBody}</span>
            )}
            {question.date && <span className="text-zinc-600">{formatGbDate(question.date)}</span>}
          </div>
        </div>
      </div>
    </a>
  );
}
