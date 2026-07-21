import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#000000] group-[.toaster]:text-white group-[.toaster]:border-[#333333] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-300",
          actionButton: "group-[.toast]:bg-white group-[.toast]:text-black",
          cancelButton: "group-[.toast]:bg-[#333333] group-[.toast]:text-white",
          error: "group-[.toaster]:bg-[#000000] group-[.toaster]:text-white group-[.toaster]:border-[#333333]",
          success: "group-[.toaster]:bg-[#003366] group-[.toaster]:text-white group-[.toaster]:border-[#003366]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
