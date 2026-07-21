import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-lg font-bold text-foreground mb-4">AP Automation</h3>
            <address className="text-sm text-muted-foreground not-italic leading-relaxed">
              Operated by BFSFCU<br />
              261 Morning Sun Ave, Suite B<br />
              Mill Valley, CA 94941<br />
              USA
            </address>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/#features" className="text-muted-foreground hover:text-foreground transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/#intelligence" className="text-muted-foreground hover:text-foreground transition-colors">
                  AP Intelligence
                </Link>
              </li>
              {/* Pricing link temporarily hidden
              <li>
                <Link to="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              */}
              <li>
                <Link to="/developers" className="text-muted-foreground hover:text-foreground transition-colors">
                  Developers
                </Link>
              </li>
              <li>
                <Link to="/security" className="text-muted-foreground hover:text-foreground transition-colors">
                  Security
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/cookies" className="text-muted-foreground hover:text-foreground transition-colors">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link to="/dpa" className="text-muted-foreground hover:text-foreground transition-colors">
                  DPA
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="mailto:info@clarusap.com" className="text-muted-foreground hover:text-foreground transition-colors">
                  info@clarusap.com
                </a>
                <span className="text-muted-foreground/60 text-xs block">General</span>
              </li>
              <li>
                <a href="mailto:support@clarusap.com" className="text-muted-foreground hover:text-foreground transition-colors">
                  support@clarusap.com
                </a>
                <span className="text-muted-foreground/60 text-xs block">Support</span>
              </li>
              <li>
                <a href="mailto:legal@clarusap.com" className="text-muted-foreground hover:text-foreground transition-colors">
                  legal@clarusap.com
                </a>
                <span className="text-muted-foreground/60 text-xs block">Legal + Policies</span>
              </li>
              <li>
                <a href="mailto:billing@clarusap.com" className="text-muted-foreground hover:text-foreground transition-colors">
                  billing@clarusap.com
                </a>
                <span className="text-muted-foreground/60 text-xs block">Billing</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust Statement */}
        <div className="py-6 border-t border-border mb-6">
          <p className="text-sm text-muted-foreground text-center max-w-3xl mx-auto">
            AP Automation is built and operated in the United States by BFSFCU. 
            Designed for regulated industries with enterprise-grade security controls.
          </p>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} BFSFCU. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
            <a href="https://www.hyperwise.io" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Hyperwise.io
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
