import { FileText, Newspaper, Users } from "lucide-react";
import { COMPANIES, departmentById, toolsFor, type DepartmentId } from "@/lib/intranet";
import ToolLink from "@/components/ToolLink";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-black text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Placeholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">
      {icon}
      {text}
    </div>
  );
}

/** A department: its tools grouped by company, then documents, news and people. */
export default function DepartmentView({ id }: { id: DepartmentId }) {
  const dept = departmentById(id)!;
  const Icon = dept.icon;
  const tools = toolsFor(id);
  const byCompany = COMPANIES.map(c => ({ company: c, tools: tools.filter(t => t.company === c.id) })).filter(g => g.tools.length);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "rgba(0,159,103,0.1)" }}>
          <Icon className="h-6 w-6 text-[#00704a]" />
        </span>
        <div>
          <h1 className="text-2xl font-black text-gray-900">{dept.name}</h1>
          <p className="text-gray-500">{dept.description}</p>
        </div>
      </div>

      <Section title="Tools">
        {byCompany.length === 0 ? (
          <Placeholder icon={<FileText className="h-5 w-5 text-gray-400" />} text={`No tools listed for ${dept.name} yet.`} />
        ) : (
          <div className="space-y-6">
            {byCompany.map(({ company, tools }) => (
              <div key={company.id}>
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{company.name}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map(t => (
                    <ToolLink key={t.href} tool={t} variant="card" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Documents">
          <Placeholder icon={<FileText className="h-5 w-5 text-gray-400" />} text="Official documents will be listed here." />
        </Section>
        <Section title="News">
          <Placeholder icon={<Newspaper className="h-5 w-5 text-gray-400" />} text="Department announcements will appear here." />
        </Section>
        <Section title="People">
          <Placeholder icon={<Users className="h-5 w-5 text-gray-400" />} text="The team and its leader will be shown here." />
        </Section>
      </div>
    </div>
  );
}
