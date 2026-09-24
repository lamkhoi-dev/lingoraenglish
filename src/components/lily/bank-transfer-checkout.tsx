/**
 * "Pay by bank transfer" screen: displays a dynamic order summary + VietQR code
 * + fixed bank details + one-time reference code, with real-time polling until
 * SePay's webhook activates the plan.
 */
import { Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  QrCode,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { BillingCard, formatMoney } from "@/components/lily/billing-ui";
import { SectionHeading } from "@/components/lily/brand";
import { useAuth } from "@/lib/auth";
import { getBankTransferOrder, type BankTransferOrder } from "@/lib/bank-transfer.functions";
import { useI18n } from "@/lib/i18n";

const POLL_MS = 3000;

function useCountdown(expiresAt: string | undefined) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return {
    isExpired: remaining <= 0,
    formatted: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

function CopyField({
  label,
  value,
  highlight = false,
  badge,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  badge?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success(`Đã sao chép ${label.toLowerCase()}`);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`group flex items-center justify-between gap-3 rounded-xl p-3.5 transition-all ${
        highlight
          ? "border-2 border-brass/80 bg-brass/15 shadow-sm"
          : "border border-border bg-surface-2 hover:border-border/80"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
          {badge && (
            <span className="rounded-md border border-amber-400/50 bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
              {badge}
            </span>
          )}
        </div>
        <dd
          className={`mt-1 truncate text-base font-bold ${
            highlight ? "font-mono text-lg font-black tracking-widest text-brass-soft select-all" : "text-foreground"
          }`}
        >
          {value || "—"}
        </dd>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!value}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
          copied
            ? "bg-emerald-500 text-white"
            : highlight
              ? "bg-brass text-background hover:bg-brass-soft shadow-xs"
              : "border border-border bg-surface hover:bg-surface-3 text-foreground"
        }`}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            <span>Đã chép</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>Sao chép</span>
          </>
        )}
      </button>
    </div>
  );
}

export function BankTransferCheckoutView() {
  const { t, locale } = useI18n();
  const isVi = locale === "vi";
  const { user } = useAuth();
  const search = useSearch({ strict: false });
  const orderId = (search as { order?: string }).order;
  const fetchOrder = useServerFn(getBankTransferOrder);
  const [order, setOrder] = useState<BankTransferOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const countdown = useCountdown(order?.expires_at);

  useEffect(() => {
    if (!user || !orderId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const row = await fetchOrder({ data: { orderId } });
        if (cancelled) return;
        setOrder(row);
        if (row.status !== "pending" && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this order.");
      }
    };
    void poll();
    timer.current = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [fetchOrder, orderId, user]);

  const downloadQr = () => {
    if (!order?.qr_url) return;
    const link = document.createElement("a");
    link.href = order.qr_url;
    link.download = `VietQR_${order.reference_code}.png`;
    link.target = "_blank";
    link.click();
    toast.success(isVi ? "Đang tải ảnh mã VietQR..." : "Downloading VietQR image...");
  };

  if (!user) {
    return (
      <AppShell>
        <SectionHeading
          title={isVi ? "Thanh toán chuyển khoản" : "Bank transfer"}
          description={isVi ? "Vui lòng đăng nhập để tiếp tục." : "Sign in to continue."}
        />
        <BillingCard className="mt-6 text-center py-10">
          <Link to="/auth" className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            {t("common.signIn")}
          </Link>
        </BillingCard>
      </AppShell>
    );
  }

  if (!orderId) {
    return (
      <AppShell>
        <SectionHeading
          title={isVi ? "Thanh toán chuyển khoản" : "Bank transfer"}
          description={isVi ? "Không tìm thấy thông tin đơn hàng." : "No order to show."}
        />
        <BillingCard className="mt-6 text-center py-10">
          <Link to="/pricing" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-2">
            {isVi ? "Quay lại bảng giá" : "Back to pricing"}
          </Link>
        </BillingCard>
      </AppShell>
    );
  }

  const planTitle = order?.plan_key === "ielts_pro" ? "LiLy AI IELTS Pro" : "LiLy AI Pro";
  const intervalTitle =
    order?.billing_interval === "year"
      ? isVi
        ? "Gói 1 Năm (12 tháng)"
        : "Yearly (12 months)"
      : isVi
        ? "Gói 1 Tháng"
        : "Monthly (1 month)";

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl py-2">
        <SectionHeading
          title={isVi ? "Cổng thanh toán VietQR 24/7" : "VietQR Bank Transfer"}
          description={
            isVi
              ? "Quét mã QR bằng ứng dụng ngân hàng hoặc MoMo để kích hoạt tài khoản Pro tự động sau 1 - 3 giây."
              : "Scan the VietQR code in any banking app to activate your Pro plan automatically."
          }
        />

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!order && !error && (
          <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
            <div className="size-10 animate-spin rounded-full border-3 border-brass border-t-transparent" />
            <p className="mt-4 text-sm text-muted-foreground">{isVi ? "Đang tạo mã thanh toán VietQR..." : t("common.loading")}</p>
          </div>
        )}

        {/* Trạng thái 1: ĐÃ THANH TOÁN THÀNH CÔNG */}
        {order?.status === "paid" && (
          <BillingCard className="mt-6 overflow-hidden border-2 border-emerald-500/40 bg-emerald-500/5 p-8 text-center shadow-lg">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
              <CheckCircle2 className="size-9" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-foreground">
              {isVi ? "Thanh toán thành công!" : "Payment received!"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              {isVi
                ? `Đơn hàng ${order.reference_code} đã được xác nhận. Tài khoản của bạn đã được nâng cấp lên gói ${planTitle}.`
                : `Order ${order.reference_code} confirmed. Your account is now upgraded to ${planTitle}.`}
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-surface-2 px-5 py-3 border border-border">
              <Sparkles className="size-4 text-brass" />
              <span className="text-sm font-semibold text-foreground">
                {planTitle} · {intervalTitle}
              </span>
            </div>

            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                to="/ai-speaking"
                className="flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-foreground shadow-md transition hover:opacity-95"
              >
                <span>{isVi ? "Bắt đầu học với LiLy AI ngay" : "Start practising now"}</span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </BillingCard>
        )}

        {/* Trạng thái 2: ĐƠN HÀNG HẾT HẠN */}
        {order?.status === "expired" && (
          <BillingCard className="mt-6 border-border p-8 text-center">
            <Clock className="mx-auto size-12 text-muted-foreground" />
            <h2 className="mt-4 font-display text-xl font-bold text-foreground">
              {isVi ? "Đơn thanh toán đã hết hạn" : "This order has expired"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isVi
                ? "Thời gian giữ đơn hàng đã kết thúc mà chưa nhận được chuyển khoản. Bạn chưa bị trừ tiền."
                : "No matching transfer was received in time. You were not charged."}
            </p>
            <Link
              to="/pricing"
              className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {isVi ? "Tạo đơn mới" : "Start again"}
            </Link>
          </BillingCard>
        )}

        {/* Trạng thái 3: ĐANG CHỜ CHUYỂN KHOẢN (GIAO DIỆN CHÍNH) */}
        {order?.status === "pending" && (
          <div className="mt-6 grid gap-6 md:grid-cols-12">
            {/* CỘT TRÁI: MÃ QR VIETQR & ĐỒNG HỒ ĐẾM NGƯỢC */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="w-full rounded-2xl border-2 border-brass/40 bg-surface p-5 shadow-md flex flex-col items-center">
                {/* Header QR */}
                <div className="flex w-full items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-[#0054A6]">Viet</span>
                    <span className="font-extrabold text-sm text-[#ED1C24]">QR</span>
                    <span className="text-xs text-muted-foreground ml-1">· Napas247</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-mono font-bold text-amber-300 shadow-xs">
                    <Clock className="size-3.5 text-amber-400" />
                    <span>{countdown.formatted}</span>
                  </div>
                </div>

                {/* QR Code Image */}
                {order.qr_url ? (
                  <div className="relative my-4 rounded-xl bg-white p-2.5 shadow-sm border border-slate-200">
                    <img
                      src={order.qr_url}
                      alt="VietQR code"
                      className="h-auto w-56 max-w-full rounded-lg object-contain"
                    />
                  </div>
                ) : (
                  <div className="my-6 flex flex-col items-center justify-center p-6 text-center rounded-xl bg-surface-2 border border-border">
                    <QrCode className="size-12 text-brass-soft mb-2 opacity-60" />
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {isVi
                        ? "Chưa cấu hình tài khoản SePay nhận tiền. Vui lòng thêm SEPAY_API_KEY vào cấu hình hệ thống."
                        : "No SePay receiving account configured. Please set SEPAY_API_KEY."}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <button
                  type="button"
                  onClick={downloadQr}
                  disabled={!order.qr_url}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-foreground transition hover:bg-surface-3 disabled:opacity-50"
                >
                  <Download className="size-3.5" />
                  <span>{isVi ? "Tải ảnh mã QR về máy" : "Download QR Code"}</span>
                </button>

                {/* Status indicator */}
                <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2/80 px-3 py-2 text-xs text-muted-foreground border border-border/50">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="font-medium">
                    {isVi ? "Đang chờ thanh toán tự động..." : "Awaiting payment..."}
                  </span>
                </div>
              </div>

              {/* Hướng dẫn 3 bước */}
              <div className="mt-4 w-full rounded-2xl border border-border bg-surface-2/50 p-4 text-xs text-muted-foreground">
                <p className="font-bold text-foreground mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  <span>{isVi ? "Cách thanh toán nhanh:" : "How to pay:"}</span>
                </p>
                <ol className="space-y-1.5 list-decimal pl-4">
                  <li>{isVi ? "Mở ứng dụng Ngân hàng bất kỳ hoặc MoMo." : "Open your banking app or e-wallet."}</li>
                  <li>{isVi ? "Chọn quét mã QR và quét mã ở trên." : "Scan the VietQR code above."}</li>
                  <li>{isVi ? "Kiểm tra số tiền và bấm Xác nhận chuyển." : "Confirm transfer (amount is auto-filled)."}</li>
                </ol>
              </div>
            </div>

            {/* CỘT PHẢI: THÔNG TIN CHI TIẾT & CHUYỂN KHOẢN THỦ CÔNG */}
            <div className="md:col-span-7 space-y-4">
              {/* Thẻ tóm tắt gói mua */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {isVi ? "Gói đăng ký" : "Selected Plan"}
                    </span>
                    <h3 className="font-display text-xl font-bold text-foreground mt-0.5">{planTitle}</h3>
                    <p className="text-xs text-brass-soft font-medium mt-0.5">{intervalTitle}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {isVi ? "Số tiền" : "Total"}
                    </span>
                    <p className="font-display text-2xl md:text-3xl font-black text-brass-soft mt-0.5 tracking-tight">
                      {formatMoney(order.amount_vnd, "VND", "vi-VN")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bảng chi tiết chuyển khoản có nút Copy */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Building2 className="size-4 text-brass" />
                  <span>{isVi ? "Thông tin chuyển khoản thủ công" : "Manual Transfer Details"}</span>
                </h4>

                <dl className="space-y-2.5">
                  <CopyField
                    label={isVi ? "Ngân hàng thụ hưởng" : "Bank"}
                    value={order.bank_name || (isVi ? "Đang tải ngân hàng..." : "Loading bank...")}
                  />
                  <CopyField
                    label={isVi ? "Số tài khoản nhận" : "Account Number"}
                    value={order.account_number}
                  />
                  <CopyField
                    label={isVi ? "Chủ tài khoản" : "Account Holder"}
                    value={order.account_name}
                  />
                  <CopyField
                    label={isVi ? "Số tiền chính xác" : "Exact Amount"}
                    value={formatMoney(order.amount_vnd, "VND", "vi-VN")}
                  />
                  <CopyField
                    label={isVi ? "Nội dung chuyển khoản (BẮT BUỘC)" : "Transfer Note (Required)"}
                    value={order.reference_code}
                    highlight
                    badge={isVi ? "Quan trọng" : "Important"}
                  />
                </dl>

                <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 border border-amber-500/20">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {isVi
                        ? "Lưu ý: Giữ nguyên nội dung chuyển khoản"
                        : "Note: Keep the exact transfer content"}
                    </span>
                  </p>
                  <p className="mt-1 leading-relaxed pl-5.5 text-[11px] opacity-90">
                    {isVi
                      ? `Mã "${order.reference_code}" giúp hệ thống SePay nhận biết thanh toán của bạn để kích hoạt tự động 100%. Nếu quên nhập mã, vui lòng liên hệ admin để hỗ trợ duyệt tay.`
                      : `The code "${order.reference_code}" lets our system identify your transfer. If you forgot to include it, please contact support.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
