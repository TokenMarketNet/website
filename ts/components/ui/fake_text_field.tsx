import * as React from 'react';
import {colors} from 'material-ui/styles';
import {InputLabel} from 'ts/components/ui/input_label';

const styles = {
    hr: {
        borderBottom: '1px solid rgb(224, 224, 224)',
        borderLeft: 'none rgb(224, 224, 224)',
        borderRight: 'none rgb(224, 224, 224)',
        borderTop: 'none rgb(224, 224, 224)',
        bottom: 6,
        boxSizing: 'content-box',
        margin: 0,
        position: 'absolute',
        width: '100%',
    },
};

interface FakeTextFieldProps {
    label?: React.ReactNode | string;
    children?: any;
}

export function FakeTextField(props: FakeTextFieldProps) {
    return (
        <div className="relative">
            {props.label !== '' && <InputLabel text={props.label} />}
            <div className="py2">
                {props.children}
            </div>
            <hr style={styles.hr} />
        </div>
    );
}
