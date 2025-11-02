import { createForm } from '@tanstack/solid-form'
import * as v from 'valibot'
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field'
import { Button } from './ui/button'
import type { AnyFieldApi } from '@tanstack/solid-form'


interface FieldInfoProps {
  field: AnyFieldApi
}

function FieldInfo(props: FieldInfoProps) {
  return (
    <>
      {props.field.state.meta.isTouched && !props.field.state.meta.isValid ? (
        <em>
          {props.field.state.meta.errors.map((err) => err.message).join(',')}
        </em>
      ) : null}
      {props.field.state.meta.isValidating ? 'Validating...' : null}
    </>
  )
}

const LoginForm = () => {
    const form = createForm(()=>({
        defaultValues: {
            phone: '',
        },
        validators: {
            onChange: v.object({
                phone: v.pipe(v.string(), v.minLength(8, 'Phone number must be 8 digits'), v.maxLength(8, 'Phone number must be 8 digits'), v.regex(/^[6-9]\d{7}$/, 'Phone number must be 8 digits')),
            })
        },
        onSubmit: async (values) => {
            console.log(values)
        }
    }))


    return (
        <div>
            <h1>Login</h1>
               <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="phone" children={(field ) => (
            <TextField
        >
            <TextFieldLabel for={field().name}>Phone number</TextFieldLabel>
            <TextFieldInput
                id={field().name}
                name={field().name}
                   value={field().state.value}
                    onBlur={field().handleBlur}
                    onInput={(e) => field().handleChange(e.currentTarget.value)}
                placeholder="Phone number"
            />
<FieldInfo field={field()} />

        </TextField>
        )}/>
         <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
          children={(state) => {
            return (
              <Button type="submit" disabled={!state().canSubmit}>
                {state().isSubmitting ? '...' : 'Submit'}
              </Button>
            )
          }}
        />
        </form>
        </div>
    )
}

export default LoginForm;