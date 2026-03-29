import { Link } from "wouter";
import { ArrowLeft, Ghost } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-5">
          <Ghost className="w-7 h-7 text-[#737373]" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#e5e5e5] mb-2">404</h1>
        <p className="text-[#737373] text-sm mb-6 leading-relaxed">
          This page doesn't exist or has been moved.
        </p>
        <Link href="/">
          <button className="flat-btn-primary mx-auto">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
    </div>
  );
}
