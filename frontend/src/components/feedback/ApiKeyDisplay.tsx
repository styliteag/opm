import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ApiKeyDisplayProps {
  apiKey: string;
  onDismiss: () => void;
}

export function ApiKeyDisplay({ apiKey, onDismiss }: ApiKeyDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Alert className="border-primary/30 bg-primary/5">
      <AlertDescription>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-emphasis text-primary">
              New API Key — copy now, it won't be shown again
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDismiss}
              className="h-6 w-6"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-sm text-foreground select-all">
              {apiKey}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
