document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".management-pipeline-nav")
    .forEach((nav, index) => {
      const menuId =
        `management-nav-menu-${index + 1}`;

      nav.id = menuId;

      const currentPath =
        window.location.pathname;

      const links = [
        {
          label: "Management Home",
          href: "/management/hub/",
          className:
            "management-pipeline-nav__home"
        },
        {
          label: "Leads",
          href: "/connect/leads/"
        },
        {
          label: "Appointments",
          href: "/connect/appointments/"
        },
        {
          label: "Proposals",
          href: "/connect/proposals/"
        },
        {
          label: "Enrollment",
          href: "/intake-management/"
        },
        {
          divider: true
        },
        {
          label: "Inbox",
          href: "/management/inbox/"
        },
        {
          divider: true
        },
        {
          label: "Try a Class",
          href: "/connect/admissions-requests/"
        },
        {
          divider: true
        },
        {
          heading: "Tools"
        },
        {
          label: "Pricing & Estimates",
          href: "/management/pricing/"
        },
        {
          label: "Membership & Competition Tools",
          href: "/management/membership-tools/"
        },
        {
          divider: true
        },
        {
          label: "Switch Workspace",
          href: "/login/"
        }
      ];

      nav.innerHTML = "";

      links.forEach((item) => {
        if (item.divider) {
          const divider =
            document.createElement("div");

          divider.className =
            "management-nav-divider";

          divider.setAttribute(
            "aria-hidden",
            "true"
          );

          nav.append(divider);
          return;
        }

        if (item.heading) {
          const heading =
            document.createElement("span");

          heading.className =
            "management-nav-heading";

          heading.textContent =
            item.heading;

          nav.append(heading);
          return;
        }

        const link =
          document.createElement("a");

        link.href = item.href;
        link.textContent = item.label;

        if (item.className) {
          link.className =
            item.className;
        }

        if (
          currentPath === item.href ||
          (
            item.href !== "/" &&
            currentPath.startsWith(item.href)
          )
        ) {
          link.setAttribute(
            "aria-current",
            "page"
          );
        }

        nav.append(link);
      });

      const menuSignOut =
        document.createElement("button");

      menuSignOut.type = "button";
      menuSignOut.className =
        "management-nav-signout";
      menuSignOut.textContent =
        "Sign Out";

      menuSignOut.addEventListener(
        "click",
        async () => {
          const { auth } = await import(
            "/assets/js/firebase-init.js"
          );

          const { signOut } = await import(
            "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js"
          );

          await signOut(auth);

          window.location.replace(
            "/login/"
          );
        }
      );

      nav.append(menuSignOut);

      const toggle =
        document.createElement("button");

      toggle.type = "button";
      toggle.className =
        "management-nav-toggle";

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );

      toggle.setAttribute(
        "aria-controls",
        menuId
      );

      toggle.innerHTML = `
        <span
          class="management-nav-toggle__icon"
          aria-hidden="true"
        >☰</span>
        <span>Management</span>
      `;

      nav.parentNode.insertBefore(
        toggle,
        nav
      );

      toggle.addEventListener(
        "click",
        () => {
          const open =
            nav.classList.toggle(
              "is-open"
            );

          toggle.setAttribute(
            "aria-expanded",
            String(open)
          );
        }
      );

      nav
        .querySelectorAll("a")
        .forEach((link) => {
          link.addEventListener(
            "click",
            () => {
              nav.classList.remove(
                "is-open"
              );

              toggle.setAttribute(
                "aria-expanded",
                "false"
              );
            }
          );
        });
    });
});
