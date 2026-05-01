import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function FounderFinanceStub({ title, description }: { title: string; description: string }) {
  return (
    <Card className="p-8 text-center">
      <Badge variant="outline" className="mb-3">Coming soon</Badge>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
    </Card>
  );
}
