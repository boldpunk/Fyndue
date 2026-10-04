import { ArrowUpRight, Bot, Code2, Gem, LayoutDashboard, Palette, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/layout/logo";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "О разработчике",
  description: "Fyndue спроектирован и разработан в Bold Studio — продукт, дизайн, айдентика и разработка.",
};

const STUDIO_URL = "https://boldstudio.uz";

const WORK = [
  { icon: Gem, title: "Продукт", text: "Логика долгов, подписок и двух валют. Графики платежей считаются как в банке — сверены с реальным договором до тийина." },
  { icon: LayoutDashboard, title: "UX/UI", text: "Четыре главных ответа на первом экране, мобильная версия, светлая и тёмная темы, понятный русский язык." },
  { icon: Palette, title: "Айдентика", text: "Знак «F.», где долг идёт к нулю, фирменные цвета, иконки iOS и Android, превью ссылок и брендбук." },
  { icon: Code2, title: "Разработка", text: "Next.js, TypeScript и PostgreSQL. Деньги — только в десятичной арифметике, без округлений «примерно»." },
  { icon: Bot, title: "Telegram-бот", text: "Напоминания о платежах и списаниях подписок, предупреждение о нехватке денег на карте, команды /today и /subs." },
  { icon: ShieldCheck, title: "Инфраструктура", text: "Собственный сервер в Oracle Cloud, Docker, HTTPS, ежедневный курс ЦБ и ночные бэкапы." },
];

const STATS = [
  { value: "260+", label: "автотестов" },
  { value: "1 тийин", label: "точность графиков" },
  { value: "2 валюты", label: "по курсу ЦБ" },
  { value: "24/7", label: "напоминания" },
];

const SERVICES = ["Веб-сервисы и SaaS", "Личные кабинеты и CRM", "PWA для телефона", "Telegram-боты", "Айдентика и брендбуки", "Сайты и лендинги"];

export default async function AboutPage() {
  const signedIn = Boolean(await getSession());
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Fyndue">
          <Logo />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href={signedIn ? "/dashboard" : "/login"}>{signedIn ? "Открыть Fyndue" : "Войти"}</Link>
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl gap-16 px-4 pb-16 sm:px-6">
        <section className="relative overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_12%_8%,#6B5BFF_0,#4F39F6_40%,#2A16B8_100%)] px-6 py-12 text-white sm:px-12 sm:py-16">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.09)_1px,transparent_1px)] [background-size:26px_26px]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="grid gap-5">
              <p className="text-[13px] font-semibold tracking-[.16em] text-[#3DDCAB] uppercase">О разработчике</p>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">Fyndue создан в Bold&nbsp;Studio</h1>
              <p className="max-w-xl text-lg leading-relaxed text-[#dcd8ff]">
                Мы проектируем и разрабатываем цифровые продукты целиком: от идеи и айдентики до сервера в облаке. Fyndue — наш продукт для тех, у кого кредиты,
                рассрочки и подписки в двух валютах.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild size="lg" className="bg-white text-[#2A16B8] hover:bg-white/90">
                  <a href={STUDIO_URL} target="_blank" rel="noopener">
                    boldstudio.uz <ArrowUpRight />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                  <Link href={signedIn ? "/dashboard" : "/login"}>Открыть Fyndue</Link>
                </Button>
              </div>
            </div>
            <div className="hidden justify-center lg:flex">
              <LogoMark className="size-64 drop-shadow-[0_40px_60px_rgba(10,5,60,.45)]" />
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="grid gap-2">
            <p className="text-[13px] font-semibold tracking-[.16em] text-primary uppercase">Что мы сделали</p>
            <h2 className="text-3xl font-semibold tracking-tight">Продукт под ключ</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WORK.map(({ icon: Icon, title, text }) => (
              <div key={title} className="grid content-start gap-3 rounded-2xl border bg-card p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-primary-subtle text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 rounded-[28px] bg-[#0E0B24] p-8 text-white sm:grid-cols-4 sm:p-10">
          {STATS.map((s) => (
            <div key={s.label} className="grid gap-1">
              <span className="tabular text-3xl font-semibold tracking-tight sm:text-4xl">{s.value}</span>
              <span className="text-sm text-[#b9b5e8]">{s.label}</span>
            </div>
          ))}
        </section>

        <section className="grid items-center gap-8 rounded-[28px] border bg-card p-8 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-4">
            <p className="text-[13px] font-semibold tracking-[.16em] text-primary uppercase">Bold Studio</p>
            <h2 className="text-3xl font-semibold tracking-tight">Нужен похожий продукт?</h2>
            <p className="text-muted-foreground">Расскажите о задаче — предложим решение, дизайн и сроки. Делаем продукты, которыми пользуемся сами.</p>
            <div className="flex flex-wrap gap-2">
              {SERVICES.map((s) => (
                <span key={s} className="rounded-full border px-3 py-1.5 text-[13px] font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="flex lg:justify-end">
            <Button asChild size="lg">
              <a href={STUDIO_URL} target="_blank" rel="noopener">
                Написать в Bold Studio <ArrowUpRight />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter className="pb-8" />
    </div>
  );
}
