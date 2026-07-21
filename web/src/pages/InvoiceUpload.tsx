import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { invoicesApi } from "@/services/invoices";
import { Loader2, Upload, FileText, Mail, Sparkles, FolderUp, CheckCircle, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface UploadFile {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  error?: string;
  invoiceId?: string;
}

const InvoiceUpload = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles: UploadFile[] = Array.from(e.target.files)
        .filter(file => file.type === 'application/pdf' || file.type.startsWith('image/'))
        .map(file => ({
          file,
          status: 'pending' as const,
          progress: 0,
        }));

      if (newFiles.length < e.target.files.length) {
        toast({
          variant: "destructive",
          title: "Some files skipped",
          description: "Only PDF and image files are accepted",
        });
      }

      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFile = useCallback(async (uploadFile: UploadFile, tenantId: string, index: number) => {
    // Update status to uploading
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'uploading', progress: 20 } : f
    ));

    try {
      // Upload returns as soon as the file is stored and queued; extraction
      // happens in the background worker.
      const result = await invoicesApi.upload(uploadFile.file);
      const processData = { invoice_id: result.invoiceId };

      setFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'processing', progress: 50 } : f
      ));


      // Update status to success
      setFiles(prev => prev.map((f, i) => 
        i === index ? { 
          ...f, 
          status: 'success', 
          progress: 100,
          invoiceId: processData?.invoice_id,
        } : f
      ));

      return { success: true, data: processData };
    } catch (error: any) {
      // Update status to error
      setFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: 'error', progress: 0, error: error.message } : f
      ));
      return { success: false, error };
    }
  }, []);

  const handleBulkUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "No files to upload",
        description: "Please select files to upload",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Get current user's tenant
      // Single-tenant: no tenant lookup. Identity comes from the token.
      const roles = null;


      if (!roles?.tenant_id) {
        throw new Error("No tenant found for user");
      }

      // Process files sequentially to avoid rate limiting
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < files.length; i++) {
        if (files[i].status === 'pending') {
          const result = await processFile(files[i], roles.tenant_id, i);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
          // Small delay between files to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      toast({
        title: "Bulk upload complete",
        description: `${successCount} succeeded, ${errorCount} failed`,
      });

    } catch (error: any) {
      console.error('Bulk upload error:', error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload invoices",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'uploading':
        return <Badge className="bg-blue-500">Uploading</Badge>;
      case 'processing':
        return <Badge className="bg-primary">Processing</Badge>;
      case 'success':
        return <Badge className="bg-success">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const totalProgress = files.length > 0 
    ? files.reduce((acc, f) => acc + f.progress, 0) / files.length 
    : 0;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Upload Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Upload single or multiple invoices for AI processing
          </p>
        </div>

        {/* Bulk Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderUp className="h-5 w-5" />
              Bulk Invoice Upload
            </CardTitle>
            <CardDescription>
              Select multiple PDF or image files to process. Files are uploaded and processed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="files">Select Files (PDF, JPG, PNG)</Label>
              <Input
                id="files"
                type="file"
                accept=".pdf,image/*"
                multiple
                onChange={handleFileChange}
                disabled={isProcessing}
              />
            </div>

            {files.length > 0 && (
              <>
                {/* Overall Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">
                      {successCount}/{files.length} completed
                    </span>
                  </div>
                  <Progress value={totalProgress} className="h-2" />
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="text-success">{successCount} succeeded</span>
                    <span className="text-destructive">{errorCount} failed</span>
                    <span>{pendingCount} pending</span>
                  </div>
                </div>

                {/* File List */}
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                  {files.map((uploadFile, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
                    >
                      {getStatusIcon(uploadFile.status)}
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate text-sm">
                          {uploadFile.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(uploadFile.file.size / 1024 / 1024).toFixed(2)} MB
                          {uploadFile.error && (
                            <span className="text-destructive ml-2">• {uploadFile.error}</span>
                          )}
                        </p>
                      </div>
                      {getStatusBadge(uploadFile.status)}
                      {uploadFile.status === 'pending' && !isProcessing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {uploadFile.status === 'success' && uploadFile.invoiceId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/invoices/${uploadFile.invoiceId}`)}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleBulkUpload}
                disabled={pendingCount === 0 || isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing {files.filter(f => f.status === 'uploading' || f.status === 'processing').length} files...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Process {pendingCount > 0 ? `(${pendingCount} files)` : ''}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setFiles([])}
                disabled={files.length === 0 || isProcessing}
              >
                Clear All
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/invoices')}
                disabled={isProcessing}
              >
                View Invoices
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* What Happens Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              What happens next?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </div>
              <p>AI extracts invoice details (vendor, amounts, line items)</p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </div>
              <p><strong>Auto-creates new vendors</strong> based on tax ID, email domain, or name</p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </div>
              <p>Anomaly detection checks for issues and assigns risk score</p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                4
              </div>
              <p>Invoice enters workflow (validated → submitted for review)</p>
            </div>
          </CardContent>
        </Card>

        {/* Email Automation Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Automation
            </CardTitle>
            <CardDescription>
              Automatically process invoices sent via email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Forward invoices to your dedicated email address to auto-process them:
            </p>
            <code className="block rounded bg-muted px-3 py-2 text-xs">
              invoices+{'{tenant_id}'}@yourapp.com
            </code>
            <p className="text-xs text-muted-foreground">
              Contact your administrator to set up email forwarding with your email provider (SendGrid, Mailgun, AWS SES).
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default InvoiceUpload;
