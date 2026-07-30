export default function QuickBooksErrorPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-ink">QuickBooks connection failed</h1>
      <p className="mt-2 text-sm text-muted">
        Something went wrong completing the QuickBooks authorization. Check the server logs
        and try connecting again.
      </p>
    </div>
  );
}
