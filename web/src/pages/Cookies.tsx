import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Clarus AP</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Back Navigation */}
      <div className="container py-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      {/* Content */}
      <section className="py-12">
        <div className="container">
          <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
            <h1 className="text-4xl font-bold text-foreground mb-2">Cookie Policy</h1>
            <p className="text-muted-foreground mb-8">Last updated: November 30, 2025</p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">1. What Are Cookies</h2>
            <p className="text-muted-foreground mb-4">
              Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences and improve your experience.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">2. How We Use Cookies</h2>
            <p className="text-muted-foreground mb-4">Clarus AP uses cookies for:</p>

            <h3 className="text-xl font-medium text-foreground mt-6 mb-3">Essential Cookies</h3>
            <p className="text-muted-foreground mb-4">
              Required for the Service to function. These include authentication tokens that keep you logged in and security cookies that protect your session.
            </p>

            <h3 className="text-xl font-medium text-foreground mt-6 mb-3">Functional Cookies</h3>
            <p className="text-muted-foreground mb-4">
              Remember your preferences such as language settings, theme (light/dark mode), and dashboard configurations.
            </p>

            <h3 className="text-xl font-medium text-foreground mt-6 mb-3">Analytics Cookies</h3>
            <p className="text-muted-foreground mb-4">
              Help us understand how users interact with the Service so we can improve functionality and user experience. These cookies collect anonymous usage data.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">3. Third-Party Cookies</h2>
            <p className="text-muted-foreground mb-4">
              We may use third-party services that set their own cookies, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Authentication providers for secure login</li>
              <li>Analytics services to understand usage patterns</li>
              <li>Error monitoring services to improve reliability</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">4. Managing Cookies</h2>
            <p className="text-muted-foreground mb-4">
              Most browsers allow you to control cookies through their settings. You can:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Block all cookies</li>
              <li>Accept only first-party cookies</li>
              <li>Delete cookies when you close your browser</li>
              <li>Browse in private/incognito mode</li>
            </ul>
            <p className="text-muted-foreground mb-4">
              Note that blocking essential cookies may prevent you from using the Service.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">5. Cookie Retention</h2>
            <p className="text-muted-foreground mb-4">
              Session cookies are deleted when you close your browser. Persistent cookies remain on your device for a specified period (typically 30 days to 1 year) unless you delete them.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">6. Updates to This Policy</h2>
            <p className="text-muted-foreground mb-4">
              We may update this Cookie Policy from time to time. Changes will be posted on this page with an updated revision date.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">7. Contact</h2>
            <p className="text-muted-foreground mb-4">
              For questions about our use of cookies:
            </p>
            <address className="text-muted-foreground not-italic mb-4">
              Hyperwise LLC<br />
              261 Morning Sun Ave, Suite B<br />
              Mill Valley, CA 94941<br />
              <a href="mailto:legal@clarusap.com" className="text-accent hover:underline">legal@clarusap.com</a>
            </address>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Cookies;
