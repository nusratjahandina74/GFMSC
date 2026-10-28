import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Copy, Check, Mail, MailWarning } from "lucide-react";

export default function CredentialsModal({ open, onClose, name, email, password, emailSent }) {
  const [copied, setCopied] = useState(false);

  if (!password) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Login Details Created</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {emailSent ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
              <Mail className="h-4 w-4 shrink-0" />
              An email with these details was also sent to {email}.
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg">
              <MailWarning className="h-4 w-4 shrink-0" />
              Email could not be sent — copy these details and share them yourself.
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Name: </span>
              <span className="font-medium">{name}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Email: </span>
              <span className="font-medium">{email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Password: </span>
              <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono text-sm">
                {password}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Copy password"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            This password is shown only once and is not stored anywhere in plain text — save it now.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg transition-all"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
