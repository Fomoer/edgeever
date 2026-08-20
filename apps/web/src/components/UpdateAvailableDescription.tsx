import { Trans } from "react-i18next";

const LEADING_VERSION_PREFIX = /^v/;

export const UpdateAvailableDescription = ({ version }: { version: string }) => (
  <Trans
    i18nKey="systemInfo.updateAvailableDescription"
    values={{ version: version.replace(LEADING_VERSION_PREFIX, "") }}
    components={{
      paragraph: <span className="mt-1.5 block first:mt-0" />,
      strong: <strong className="font-semibold text-slate-700" />,
    }}
  />
);
