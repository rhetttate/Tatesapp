"use client";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Cashier</div>
      </div>
      {children}
    </div>
  );
}